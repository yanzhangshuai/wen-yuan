import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import {
  buildStageBCandidateClusters
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/candidate-clustering";
import {
  createStageBPersister,
  type StageBPersister
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/persister";
import {
  createStageBRepository,
  type StageBRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";
import { buildStageBResolutionDraftBundle } from "@/server/modules/analysis/pipelines/evidence-review/stageB/resolution-drafts";
import {
  STAGE_B_RULE_MODEL,
  STAGE_B_RULE_PROVIDER,
  STAGE_B_RULE_VERSION,
  STAGE_B_STAGE_KEY,
  summarizeStageBDecisionCounts,
  type StageBRunInput,
  type StageBRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function toResponseJson(input: {
  candidateCount : number;
  decisionSummary: string;
  persistedCounts: StageBRunResult["persistedCounts"];
}): Prisma.InputJsonObject {
  return {
    ruleVersion    : STAGE_B_RULE_VERSION,
    candidateCount : input.candidateCount,
    decisionSummary: input.decisionSummary,
    persistedCounts: {
      personaCandidates       : input.persistedCounts.personaCandidates,
      identityResolutionClaims: input.persistedCounts.identityResolutionClaims
    }
  };
}

export interface IdentityResolverDependencies {
  repository?     : Pick<StageBRepository, "listStageBMentions" | "listStageBAliasClaims">;
  persister?      : Pick<StageBPersister, "persistResolutionBundle">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "recordRawOutput" | "succeedStageRun" | "failStageRun"
  >;
}

export function createIdentityResolver(
  dependencies: IdentityResolverDependencies = {}
) {
  const repository = dependencies.repository ?? createStageBRepository();
  const persister = dependencies.persister ?? createStageBPersister();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runForBook(input: StageBRunInput): Promise<StageBRunResult> {
    if (input.runId === null) {
      throw new Error("Stage B persistence requires a non-null runId");
    }

    const mentions = await repository.listStageBMentions({
      bookId: input.bookId,
      runId : input.runId
    });
    const aliasClaims = await repository.listStageBAliasClaims({
      bookId: input.bookId,
      runId : input.runId
    });
    const chapterNos = mentions.map((mention) => mention.chapterNo);
    const started = await stageRunService.startStageRun({
      runId    : input.runId,
      bookId   : input.bookId,
      stageKey : STAGE_B_STAGE_KEY,
      attempt  : input.attempt ?? 1,
      inputHash: stableHash({
        ruleVersion  : STAGE_B_RULE_VERSION,
        mentionIds   : mentions.map((mention) => mention.id),
        aliasClaimIds: aliasClaims.map((aliasClaim) => aliasClaim.id)
      }),
      inputCount    : mentions.length + aliasClaims.length,
      chapterStartNo: chapterNos.length > 0 ? Math.min(...chapterNos) : null,
      chapterEndNo  : chapterNos.length > 0 ? Math.max(...chapterNos) : null
    });

    try {
      const clusters = buildStageBCandidateClusters({
        mentions,
        aliasClaims
      });
      const bundle = buildStageBResolutionDraftBundle({
        bookId: input.bookId,
        runId : input.runId,
        clusters
      });
      const persisted = await persister.persistResolutionBundle({
        bookId: input.bookId,
        runId : input.runId,
        bundle
      });
      const decisionSummary = summarizeStageBDecisionCounts(
        bundle.identityResolutionDrafts.map((draftRow) => ({
          resolutionKind: draftRow.draft.resolutionKind,
          reviewState   : draftRow.draft.reviewState
        }))
      );
      const responseJson = toResponseJson({
        candidateCount : bundle.personaCandidates.length,
        decisionSummary,
        persistedCounts: persisted.persistedCounts
      });
      const rawOutput = await stageRunService.recordRawOutput({
        runId         : input.runId,
        stageRunId    : started.id,
        bookId        : input.bookId,
        provider      : STAGE_B_RULE_PROVIDER,
        model         : STAGE_B_RULE_MODEL,
        requestPayload: {
          ruleVersion    : STAGE_B_RULE_VERSION,
          mentionCount   : mentions.length,
          aliasClaimCount: aliasClaims.length
        } as Prisma.InputJsonValue,
        responseText       : JSON.stringify(responseJson),
        responseJson,
        parseError         : null,
        schemaError        : null,
        discardReason      : decisionSummary,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      const outputCount =
        persisted.persistedCounts.personaCandidates
        + persisted.persistedCounts.identityResolutionClaims;
      const skippedCount = bundle.identityResolutionDrafts.filter(
        (draftRow) => draftRow.draft.reviewState === "CONFLICTED"
      ).length;

      await stageRunService.succeedStageRun(started.id, {
        outputHash         : stableHash(responseJson),
        outputCount,
        skippedCount,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      return {
        bookId         : input.bookId,
        runId          : input.runId,
        stageRunId     : started.id,
        rawOutputId    : rawOutput.id,
        inputCount     : mentions.length + aliasClaims.length,
        outputCount,
        skippedCount,
        persistedCounts: persisted.persistedCounts,
        candidateCount : bundle.personaCandidates.length,
        decisionSummary
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForBook };
}

export type IdentityResolver = ReturnType<typeof createIdentityResolver>;

export const identityResolver = createIdentityResolver();
