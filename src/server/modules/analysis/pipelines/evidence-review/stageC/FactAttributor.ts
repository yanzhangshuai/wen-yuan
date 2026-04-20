import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import { buildStageCFactAttributionDrafts } from "@/server/modules/analysis/pipelines/evidence-review/stageC/draft-builder";
import {
  createStageCPersister,
  type StageCPersister
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/persister";
import {
  createStageCRepository,
  type StageCRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/repository";
import {
  STAGE_C_RULE_MODEL,
  STAGE_C_RULE_PROVIDER,
  STAGE_C_RULE_VERSION,
  STAGE_C_STAGE_KEY,
  summarizeStageCDecisionCounts,
  type StageCRepositoryPayload,
  type StageCRunInput,
  type StageCRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function countFactRows(payload: StageCRepositoryPayload): number {
  return payload.eventClaims.length + payload.relationClaims.length + payload.timeClaims.length;
}

function collectChapterNos(payload: StageCRepositoryPayload): number[] {
  return [
    ...payload.eventClaims.map((row) => row.chapterNo),
    ...payload.relationClaims.map((row) => row.chapterNo),
    ...payload.timeClaims.map((row) => row.chapterNo)
  ];
}

function buildInputHashPayload(payload: StageCRepositoryPayload): Prisma.InputJsonObject {
  return {
    ruleVersion        : STAGE_C_RULE_VERSION,
    personaCandidateIds: payload.personaCandidates.map((row) => row.id),
    eventClaimIds      : payload.eventClaims.map((row) => row.id),
    relationClaimIds   : payload.relationClaims.map((row) => row.id),
    timeClaimIds       : payload.timeClaims.map((row) => row.id),
    conflictFlagIds    : payload.conflictFlags.map((row) => row.id)
  };
}

function buildRequestPayload(payload: StageCRepositoryPayload): Prisma.InputJsonObject {
  return {
    ruleVersion          : STAGE_C_RULE_VERSION,
    personaCandidateCount: payload.personaCandidates.length,
    eventClaimCount      : payload.eventClaims.length,
    relationClaimCount   : payload.relationClaims.length,
    timeClaimCount       : payload.timeClaims.length,
    conflictFlagCount    : payload.conflictFlags.length
  };
}

function buildResponseJson(input: {
  decisionCount     : number;
  decisionSummary   : string;
  eventDraftCount   : number;
  relationDraftCount: number;
  createdCount      : number;
  deletedCount      : number;
}): Prisma.InputJsonObject {
  return {
    ruleVersion       : STAGE_C_RULE_VERSION,
    decisionCount     : input.decisionCount,
    decisionSummary   : input.decisionSummary,
    eventDraftCount   : input.eventDraftCount,
    relationDraftCount: input.relationDraftCount,
    createdCount      : input.createdCount,
    deletedCount      : input.deletedCount
  };
}

export interface FactAttributorDependencies {
  repository?     : Pick<StageCRepository, "loadFactAttributionInputs">;
  persister?      : Pick<StageCPersister, "persistFactAttributionDrafts">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "recordRawOutput" | "succeedStageRun" | "failStageRun"
  >;
}

/**
 * Orchestrates deterministic Stage C fact attribution without modifying root claims.
 * Ambiguous attribution is persisted as reviewable derived EVENT/RELATION rows.
 */
export function createFactAttributor(
  dependencies: FactAttributorDependencies = {}
) {
  const repository = dependencies.repository ?? createStageCRepository();
  const persister = dependencies.persister ?? createStageCPersister();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runForBook(input: StageCRunInput): Promise<StageCRunResult> {
    if (input.runId === null) {
      throw new Error("Stage C persistence requires a non-null runId");
    }

    const payload = await repository.loadFactAttributionInputs({
      bookId: input.bookId,
      runId : input.runId
    });
    const chapterNos = collectChapterNos(payload);
    const inputCount = countFactRows(payload);
    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      stageKey      : STAGE_C_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : stableHash(buildInputHashPayload(payload)),
      inputCount,
      chapterStartNo: chapterNos.length > 0 ? Math.min(...chapterNos) : null,
      chapterEndNo  : chapterNos.length > 0 ? Math.max(...chapterNos) : null
    });

    try {
      const draftBundle = buildStageCFactAttributionDrafts({
        bookId: input.bookId,
        runId : input.runId,
        payload
      });
      const persistedCounts = await persister.persistFactAttributionDrafts({
        bookId          : input.bookId,
        runId           : input.runId,
        scopedChapterIds: draftBundle.scopedChapterIds,
        eventDrafts     : draftBundle.eventDrafts,
        relationDrafts  : draftBundle.relationDrafts
      });
      const decisionSummary = summarizeStageCDecisionCounts(draftBundle.decisionRows.map((row) => ({
        claimFamily: row.claimFamily,
        reviewState: row.reviewState
      })));
      const responseJson = buildResponseJson({
        decisionCount     : draftBundle.decisionRows.length,
        decisionSummary,
        eventDraftCount   : draftBundle.eventDrafts.length,
        relationDraftCount: draftBundle.relationDrafts.length,
        createdCount      : persistedCounts.createdCount,
        deletedCount      : persistedCounts.deletedCount
      });
      const rawOutput = await stageRunService.recordRawOutput({
        runId              : input.runId,
        stageRunId         : started.id,
        bookId             : input.bookId,
        provider           : STAGE_C_RULE_PROVIDER,
        model              : STAGE_C_RULE_MODEL,
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
        outputCount        : persistedCounts.createdCount,
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
        outputCount : persistedCounts.createdCount,
        skippedCount: 0,
        persistedCounts,
        decisionSummary
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForBook };
}

export type FactAttributor = ReturnType<typeof createFactAttributor>;

export const factAttributor = createFactAttributor();
