import { createHash } from "node:crypto";

import type { Prisma } from "@/generated/prisma/client";
import {
  createStage0SegmentRepository,
  type Stage0SegmentRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";
import { prisma } from "@/server/db/prisma";
import { createKnowledgeRepository } from "@/server/modules/knowledge-v2/repository";
import {
  createRuntimeKnowledgeLoader,
  type RuntimeKnowledgeBundle
} from "@/server/modules/knowledge-v2/runtime-loader";
import { compileStageAPlusKnowledge } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/knowledge-adapter";
import {
  createStageAPlusClaimPersister,
  type StageAPlusClaimPersister
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/claim-persister";
import {
  normalizeStageAPlusRelations
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/relation-normalization";
import {
  createStageAPlusRepository,
  type StageAPlusRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/repository";
import {
  createStageAPlusRuleRecall,
  type StageAPlusRuleRecall
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/rule-recall";
import {
  STAGE_A_PLUS_RULE_MODEL,
  STAGE_A_PLUS_RULE_PROVIDER,
  STAGE_A_PLUS_RULE_VERSION,
  STAGE_A_PLUS_STAGE_KEY,
  summarizeStageAPlusDiscards,
  type StageAPlusRunInput,
  type StageAPlusRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function mergeUnique(left: string[], right: string[]): string[] {
  return Array.from(new Set([...left, ...right]));
}

export interface StageAPlusKnowledgeLoader {
  load(input: {
    bookId     : string;
    bookTypeKey: string | null;
    runId      : string | null;
    visibility : "INCLUDE_PENDING";
  }): Promise<RuntimeKnowledgeBundle>;
}

export interface KnowledgeRecallStageDependencies {
  stage0Repository?    : Pick<Stage0SegmentRepository, "listPersistedChapterSegments">;
  knowledgeLoader?     : StageAPlusKnowledgeLoader;
  stageAPlusRepository?: Pick<StageAPlusRepository, "listStageARelationClaims">;
  ruleRecall?          : Pick<StageAPlusRuleRecall, "recallChapterClaims">;
  relationNormalizer?  : typeof normalizeStageAPlusRelations;
  persister?           : Pick<StageAPlusClaimPersister, "persistStageAPlusClaims">;
  stageRunService?     : Pick<
    AnalysisStageRunService,
    "startStageRun" | "succeedStageRun" | "failStageRun" | "recordRawOutput"
  >;
}

export function createKnowledgeRecallStage(
  dependencies: KnowledgeRecallStageDependencies = {}
) {
  const stage0Repository =
    dependencies.stage0Repository ?? createStage0SegmentRepository();
  const knowledgeLoader =
    dependencies.knowledgeLoader
    ?? createRuntimeKnowledgeLoader(createKnowledgeRepository(prisma));
  const stageAPlusRepository =
    dependencies.stageAPlusRepository ?? createStageAPlusRepository();
  const ruleRecall =
    dependencies.ruleRecall ?? createStageAPlusRuleRecall();
  const relationNormalizer =
    dependencies.relationNormalizer ?? normalizeStageAPlusRelations;
  const persister =
    dependencies.persister ?? createStageAPlusClaimPersister();
  const stageRunService =
    dependencies.stageRunService ?? analysisStageRunService;

  async function runForChapter(
    input: StageAPlusRunInput
  ): Promise<StageAPlusRunResult> {
    if (input.runId === null) {
      throw new Error("Stage A+ persistence requires a non-null runId");
    }

    const segments = await stage0Repository.listPersistedChapterSegments({
      runId    : input.runId,
      chapterId: input.chapter.id
    });

    const started = await stageRunService.startStageRun({
      runId    : input.runId,
      bookId   : input.bookId,
      chapterId: input.chapter.id,
      stageKey : STAGE_A_PLUS_STAGE_KEY,
      attempt  : input.attempt ?? 1,
      inputHash: stableHash({
        ruleVersion: STAGE_A_PLUS_RULE_VERSION,
        chapterId  : input.chapter.id,
        chapterNo  : input.chapter.no,
        segmentIds : segments.map((segment) => segment.id)
      }),
      inputCount    : segments.length,
      chapterStartNo: input.chapter.no,
      chapterEndNo  : input.chapter.no
    });

    try {
      if (segments.length === 0) {
        throw new Error(`Stage A+ requires persisted Stage 0 segments for chapter ${input.chapter.id}`);
      }

      const bundle = await knowledgeLoader.load({
        bookId     : input.bookId,
        bookTypeKey: input.bookTypeKey,
        runId      : input.runId,
        visibility : "INCLUDE_PENDING"
      });
      const knowledge = compileStageAPlusKnowledge(bundle);
      const stageARelations = await stageAPlusRepository.listStageARelationClaims({
        bookId   : input.bookId,
        chapterId: input.chapter.id,
        runId    : input.runId
      });
      const ruleOutput = await ruleRecall.recallChapterClaims({
        bookId     : input.bookId,
        chapterId  : input.chapter.id,
        chapterNo  : input.chapter.no,
        runId      : input.runId,
        chapterText: input.chapter.content,
        segments,
        knowledge
      });
      const relationOutput = relationNormalizer({
        bookId   : input.bookId,
        chapterId: input.chapter.id,
        runId    : input.runId,
        relations: stageARelations,
        knowledge
      });
      const recallOutput = {
        mentionDrafts   : ruleOutput.mentionDrafts,
        aliasDrafts     : ruleOutput.aliasDrafts,
        relationDrafts  : relationOutput.relationDrafts,
        discardRecords  : [...ruleOutput.discardRecords, ...relationOutput.discardRecords],
        knowledgeItemIds: mergeUnique(ruleOutput.knowledgeItemIds, relationOutput.knowledgeItemIds)
      };
      const persisted = await persister.persistStageAPlusClaims({
        scope: {
          bookId   : input.bookId,
          chapterId: input.chapter.id,
          runId    : input.runId,
          stageKey : STAGE_A_PLUS_STAGE_KEY
        },
        recallOutput
      });
      const outputCount =
        persisted.persistedCounts.mentions
        + persisted.persistedCounts.aliases
        + persisted.persistedCounts.relations;
      const discardSummary = summarizeStageAPlusDiscards(recallOutput.discardRecords);
      const responseJson = {
        ruleVersion     : STAGE_A_PLUS_RULE_VERSION,
        persistedCounts : persisted.persistedCounts,
        knowledgeItemIds: persisted.knowledgeItemIds,
        discardSummary,
        discardRecords  : recallOutput.discardRecords
      };
      const rawOutput = await stageRunService.recordRawOutput({
        runId         : input.runId,
        stageRunId    : started.id,
        bookId        : input.bookId,
        chapterId     : input.chapter.id,
        provider      : STAGE_A_PLUS_RULE_PROVIDER,
        model         : STAGE_A_PLUS_RULE_MODEL,
        requestPayload: {
          ruleVersion     : STAGE_A_PLUS_RULE_VERSION,
          chapterId       : input.chapter.id,
          segmentCount    : segments.length,
          stageARelations : stageARelations.length,
          knowledgeItemIds: [...bundle.verifiedItems, ...bundle.pendingItems].map((item) => item.id)
        } as Prisma.InputJsonValue,
        responseText       : JSON.stringify(responseJson),
        responseJson       : responseJson as Prisma.InputJsonValue,
        parseError         : null,
        schemaError        : null,
        discardReason      : discardSummary,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      await stageRunService.succeedStageRun(started.id, {
        outputHash         : stableHash(responseJson),
        outputCount,
        skippedCount       : recallOutput.discardRecords.length,
        promptTokens       : 0,
        completionTokens   : 0,
        estimatedCostMicros: BigInt(0)
      });

      return {
        bookId          : input.bookId,
        chapterId       : input.chapter.id,
        runId           : input.runId,
        stageRunId      : started.id,
        rawOutputId     : rawOutput.id,
        inputCount      : segments.length,
        outputCount,
        skippedCount    : recallOutput.discardRecords.length,
        persistedCounts : persisted.persistedCounts,
        knowledgeItemIds: persisted.knowledgeItemIds,
        discardRecords  : recallOutput.discardRecords
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  return { runForChapter };
}

export type KnowledgeRecallStage = ReturnType<typeof createKnowledgeRecallStage>;

export const knowledgeRecallStage = createKnowledgeRecallStage();
