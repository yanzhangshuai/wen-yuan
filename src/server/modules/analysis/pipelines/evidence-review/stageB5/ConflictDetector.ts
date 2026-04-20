import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import { buildStageB5ConflictDrafts } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/draft-builder";
import { detectStageB5Conflicts } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/conflict-rules";
import {
  createStageB5Persister,
  type StageB5Persister
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/persister";
import {
  createStageB5Repository,
  type StageB5Repository
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";
import {
  STAGE_B5_RULE_MODEL,
  STAGE_B5_RULE_PROVIDER,
  STAGE_B5_RULE_VERSION,
  STAGE_B5_STAGE_KEY,
  summarizeStageB5ConflictCounts,
  type StageB5RepositoryPayload,
  type StageB5RunInput,
  type StageB5RunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function countPayloadRows(payload: StageB5RepositoryPayload): number {
  return payload.personaCandidates.length
    + payload.aliasClaims.length
    + payload.eventClaims.length
    + payload.relationClaims.length
    + payload.timeClaims.length
    + payload.identityResolutionClaims.length;
}

function collectChapterNos(payload: StageB5RepositoryPayload): number[] {
  return [
    ...payload.aliasClaims.map((row) => row.chapterNo).filter((value): value is number => value !== null),
    ...payload.eventClaims.map((row) => row.chapterNo),
    ...payload.relationClaims.map((row) => row.chapterNo),
    ...payload.timeClaims.map((row) => row.chapterNo),
    ...payload.identityResolutionClaims.map((row) => row.chapterNo).filter((value): value is number => value !== null)
  ];
}

function buildInputHashPayload(payload: StageB5RepositoryPayload): Prisma.InputJsonObject {
  return {
    ruleVersion               : STAGE_B5_RULE_VERSION,
    personaCandidateIds       : payload.personaCandidates.map((row) => row.id),
    aliasClaimIds             : payload.aliasClaims.map((row) => row.id),
    eventClaimIds             : payload.eventClaims.map((row) => row.id),
    relationClaimIds          : payload.relationClaims.map((row) => row.id),
    timeClaimIds              : payload.timeClaims.map((row) => row.id),
    identityResolutionClaimIds: payload.identityResolutionClaims.map((row) => row.id)
  };
}

function buildRequestPayload(payload: StageB5RepositoryPayload): Prisma.InputJsonObject {
  return {
    ruleVersion            : STAGE_B5_RULE_VERSION,
    personaCandidateCount  : payload.personaCandidates.length,
    aliasClaimCount        : payload.aliasClaims.length,
    eventClaimCount        : payload.eventClaims.length,
    relationClaimCount     : payload.relationClaims.length,
    timeClaimCount         : payload.timeClaims.length,
    identityResolutionCount: payload.identityResolutionClaims.length
  };
}

function buildResponseJson(input: {
  conflictCount  : number;
  decisionSummary: string;
  persistedCount : number;
}): Prisma.InputJsonObject {
  return {
    ruleVersion    : STAGE_B5_RULE_VERSION,
    conflictCount  : input.conflictCount,
    decisionSummary: input.decisionSummary,
    persistedCount : input.persistedCount
  };
}

export interface ConflictDetectorDependencies {
  repository?     : Pick<StageB5Repository, "loadConflictInputs">;
  persister?      : Pick<StageB5Persister, "persistConflictDrafts">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "recordRawOutput" | "succeedStageRun" | "failStageRun"
  >;
}

/**
 * 编排 Stage B.5 的全书级规则检测，只新增 CONFLICT_FLAG，不回写或修正上游 claim。
 */
export function createConflictDetector(
  dependencies: ConflictDetectorDependencies = {}
) {
  const repository = dependencies.repository ?? createStageB5Repository();
  const persister = dependencies.persister ?? createStageB5Persister();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runForBook(input: StageB5RunInput): Promise<StageB5RunResult> {
    if (input.runId === null) {
      throw new Error("Stage B.5 persistence requires a non-null runId");
    }

    const payload = await repository.loadConflictInputs({
      bookId: input.bookId,
      runId : input.runId
    });
    const chapterNos = collectChapterNos(payload);
    const inputCount = countPayloadRows(payload);
    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      stageKey      : STAGE_B5_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : stableHash(buildInputHashPayload(payload)),
      inputCount,
      chapterStartNo: chapterNos.length > 0 ? Math.min(...chapterNos) : null,
      chapterEndNo  : chapterNos.length > 0 ? Math.max(...chapterNos) : null
    });

    try {
      const findings = detectStageB5Conflicts(payload);
      const drafts = buildStageB5ConflictDrafts({
        bookId: input.bookId,
        runId : input.runId,
        findings
      });
      const persisted = await persister.persistConflictDrafts({
        bookId: input.bookId,
        runId : input.runId,
        drafts
      });
      const decisionSummary = summarizeStageB5ConflictCounts(findings.map((finding) => ({
        conflictType: finding.conflictType,
        severity    : finding.severity
      })));
      const responseJson = buildResponseJson({
        conflictCount : drafts.length,
        decisionSummary,
        persistedCount: persisted.createdCount
      });
      const rawOutput = await stageRunService.recordRawOutput({
        runId              : input.runId,
        stageRunId         : started.id,
        bookId             : input.bookId,
        provider           : STAGE_B5_RULE_PROVIDER,
        model              : STAGE_B5_RULE_MODEL,
        requestPayload     : buildRequestPayload(payload),
        responseText       : JSON.stringify(responseJson),
        responseJson,
        parseError         : null,
        schemaError        : null,
        discardReason      : decisionSummary,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      await stageRunService.succeedStageRun(started.id, {
        outputHash         : stableHash(responseJson),
        outputCount        : persisted.createdCount,
        skippedCount       : 0,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      return {
        bookId      : input.bookId,
        runId       : input.runId,
        stageRunId  : started.id,
        rawOutputId : rawOutput.id,
        inputCount,
        outputCount : persisted.createdCount,
        skippedCount: 0,
        decisionSummary
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForBook };
}

export type ConflictDetector = ReturnType<typeof createConflictDetector>;

export const conflictDetector = createConflictDetector();
