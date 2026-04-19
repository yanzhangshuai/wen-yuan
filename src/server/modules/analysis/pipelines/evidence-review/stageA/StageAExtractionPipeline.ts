import { createHash } from "node:crypto";

import { type Prisma } from "@/generated/prisma/client";
import {
  createStage0SegmentRepository,
  type PersistedStage0Segment,
  type Stage0SegmentRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import {
  analysisStageRunService,
  type AnalysisStageRunService,
  type StageRunErrorClass
} from "@/server/modules/analysis/runs/stage-run-service";
import {
  aiCallExecutor,
  type ExecuteAiCallInput,
  type ExecuteAiCallResult
} from "@/server/modules/analysis/services/AiCallExecutor";
import { toGenerateOptions } from "@/server/modules/analysis/services/helpers/chunk-utils";
import {
  createStageAClaimNormalizer,
  type StageAClaimNormalizer
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-normalizer";
import {
  createStageAClaimPersister,
  type StageAClaimPersister
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister";
import { buildStageAExtractionPrompt } from "@/server/modules/analysis/pipelines/evidence-review/stageA/prompt-contracts";
import {
  STAGE_A_PIPELINE_STAGE,
  STAGE_A_PROMPT_VERSION,
  STAGE_A_STAGE_KEY,
  stageARawEnvelopeSchema,
  summarizeStageADiscards,
  type StageAExtractionRunInput,
  type StageAExtractionRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";
import {
  createAiProviderClient,
  type AiProviderClient,
  type CreateAiProviderInput
} from "@/server/providers/ai";
import type { PromptMessageInput } from "@/types/pipeline";

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function stripMarkdownCodeFence(raw: string): string {
  return raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
}

function toRequestPayload(input: {
  chapter  : StageAExtractionRunInput["chapter"];
  prompt   : PromptMessageInput;
  segments : PersistedStage0Segment[];
  modelId  : string | null;
  modelName: string | null;
  provider : string | null;
}): Prisma.InputJsonValue {
  const promptPayload: Prisma.InputJsonObject = {
    system: input.prompt.system,
    user  : input.prompt.user
  };

  const requestPayload: Prisma.InputJsonObject = {
    promptVersion: STAGE_A_PROMPT_VERSION,
    chapterId    : input.chapter.id,
    chapterNo    : input.chapter.no,
    chapterTitle : input.chapter.title,
    segmentCount : input.segments.length,
    modelId      : input.modelId,
    modelName    : input.modelName,
    provider     : input.provider,
    prompt       : promptPayload
  };

  return requestPayload;
}

function toStrictJson(raw: string): unknown {
  return JSON.parse(stripMarkdownCodeFence(raw));
}

interface StageAStringAiExecutor {
  execute(
    input: ExecuteAiCallInput<string>
  ): Promise<ExecuteAiCallResult<string>>;
}

export interface StageAExtractionPipelineDependencies {
  stage0Repository?: Pick<Stage0SegmentRepository, "listPersistedChapterSegments">;
  stageRunService?: Pick<
    AnalysisStageRunService,
    "startStageRun" | "succeedStageRun" | "failStageRun" | "recordRawOutput"
  >;
  aiExecutor?     : StageAStringAiExecutor;
  normalizer?     : Pick<StageAClaimNormalizer, "normalizeChapterExtraction">;
  persister?      : Pick<StageAClaimPersister, "persistChapterClaims">;
  providerFactory?: (input: CreateAiProviderInput) => AiProviderClient;
}

export function createStageAExtractionPipeline(
  dependencies: StageAExtractionPipelineDependencies = {}
) {
  const stage0Repository =
    dependencies.stage0Repository ?? createStage0SegmentRepository();
  const stageRunService =
    dependencies.stageRunService ?? analysisStageRunService;
  const aiExecutor =
    dependencies.aiExecutor ?? aiCallExecutor;
  const normalizer =
    dependencies.normalizer ?? createStageAClaimNormalizer();
  const persister =
    dependencies.persister ?? createStageAClaimPersister();
  const providerFactory =
    dependencies.providerFactory ?? createAiProviderClient;

  async function runStageAForChapter(
    input: StageAExtractionRunInput
  ): Promise<StageAExtractionRunResult> {
    if (input.runId === null) {
      throw new Error("Stage A persistence requires a non-null runId");
    }

    const segments = await stage0Repository.listPersistedChapterSegments({
      runId    : input.runId,
      chapterId: input.chapter.id
    });

    const prompt = buildStageAExtractionPrompt({
      bookId      : input.bookId,
      chapterId   : input.chapter.id,
      chapterNo   : input.chapter.no,
      chapterTitle: input.chapter.title,
      chapterText : input.chapter.content,
      segments
    });
    const requestInputHash = stableHash({
      promptVersion: STAGE_A_PROMPT_VERSION,
      chapterId    : input.chapter.id,
      chapterNo    : input.chapter.no,
      chapterTitle : input.chapter.title,
      chapterText  : input.chapter.content,
      segments     : segments.map((segment) => ({
        id          : segment.id,
        segmentIndex: segment.segmentIndex,
        segmentType : segment.segmentType,
        rawText     : segment.rawText
      }))
    });
    const started = await stageRunService.startStageRun({
      runId         : input.runId,
      bookId        : input.bookId,
      chapterId     : input.chapter.id,
      stageKey      : STAGE_A_STAGE_KEY,
      attempt       : input.attempt ?? 1,
      inputHash     : requestInputHash,
      inputCount    : segments.length,
      chapterStartNo: input.chapter.no,
      chapterEndNo  : input.chapter.no
    });

    let failureClass: StageRunErrorClass | undefined;

    try {
      if (segments.length === 0) {
        throw new Error(
          `Stage A requires persisted Stage 0 segments for chapter ${input.chapter.id}`
        );
      }

      let runtimeModelId: string | null = null;
      let runtimeModelName: string | null = null;
      let runtimeProvider: string | null = null;

      const aiResult = await aiExecutor.execute({
        stage    : STAGE_A_PIPELINE_STAGE,
        prompt,
        jobId    : input.jobId,
        chapterId: input.chapter.id,
        context  : {
          bookId: input.bookId,
          jobId : input.jobId
        },
        callFn: async ({ model, prompt: runtimePrompt }) => {
          runtimeModelId = model.modelId;
          runtimeModelName = model.modelName;
          runtimeProvider = model.provider;

          const provider = providerFactory({
            provider : model.provider,
            apiKey   : model.apiKey,
            baseUrl  : model.baseUrl,
            modelName: model.modelName
          });
          const generated = await provider.generateJson(
            runtimePrompt,
            toGenerateOptions(model)
          );

          return {
            data : generated.content,
            usage: generated.usage
          };
        }
      });

      const requestPayload = toRequestPayload({
        chapter  : input.chapter,
        prompt,
        segments,
        modelId  : runtimeModelId,
        modelName: runtimeModelName,
        provider : runtimeProvider
      });

      let parsedJson: unknown;
      try {
        // Stage A 不能把损坏 JSON“修”成空对象后继续成功，否则审核台会看到伪阳性结果。
        parsedJson = toStrictJson(aiResult.data);
      } catch (error) {
        failureClass = "PARSE_ERROR";
        await stageRunService.recordRawOutput({
          runId           : input.runId,
          stageRunId      : started.id,
          bookId          : input.bookId,
          chapterId       : input.chapter.id,
          provider        : runtimeProvider ?? "unknown",
          model           : runtimeModelId ?? aiResult.modelId,
          requestPayload,
          responseText    : aiResult.data,
          responseJson    : null,
          parseError      : error instanceof Error ? error.message : String(error),
          schemaError     : null,
          discardReason   : null,
          promptTokens    : aiResult.usage?.promptTokens ?? null,
          completionTokens: aiResult.usage?.completionTokens ?? null
        });
        throw error;
      }

      const parsedEnvelope = stageARawEnvelopeSchema.safeParse(parsedJson);
      if (!parsedEnvelope.success) {
        failureClass = "SCHEMA_VALIDATION";
        await stageRunService.recordRawOutput({
          runId           : input.runId,
          stageRunId      : started.id,
          bookId          : input.bookId,
          chapterId       : input.chapter.id,
          provider        : runtimeProvider ?? "unknown",
          model           : runtimeModelId ?? aiResult.modelId,
          requestPayload,
          responseText    : aiResult.data,
          responseJson    : parsedJson as Prisma.InputJsonValue,
          parseError      : null,
          schemaError     : parsedEnvelope.error.message,
          discardReason   : null,
          promptTokens    : aiResult.usage?.promptTokens ?? null,
          completionTokens: aiResult.usage?.completionTokens ?? null
        });
        throw parsedEnvelope.error;
      }

      const normalized = await normalizer.normalizeChapterExtraction({
        bookId     : input.bookId,
        chapterId  : input.chapter.id,
        chapterNo  : input.chapter.no,
        runId      : input.runId,
        chapterText: input.chapter.content,
        segments,
        envelope   : parsedEnvelope.data
      });

      const persisted = await persister.persistChapterClaims({
        scope: {
          bookId   : input.bookId,
          chapterId: input.chapter.id,
          runId    : input.runId,
          stageKey : STAGE_A_STAGE_KEY
        },
        normalized
      });

      const discardSummary = summarizeStageADiscards(persisted.discardRecords);
      const rawOutput = await stageRunService.recordRawOutput({
        runId           : input.runId,
        stageRunId      : started.id,
        bookId          : input.bookId,
        chapterId       : input.chapter.id,
        provider        : runtimeProvider ?? "unknown",
        model           : runtimeModelId ?? aiResult.modelId,
        requestPayload,
        responseText    : aiResult.data,
        responseJson    : parsedEnvelope.data as Prisma.InputJsonValue,
        parseError      : null,
        schemaError     : null,
        discardReason   : discardSummary,
        promptTokens    : aiResult.usage?.promptTokens ?? null,
        completionTokens: aiResult.usage?.completionTokens ?? null
      });

      const outputCount =
        persisted.persistedCounts.mentions
        + persisted.persistedCounts.times
        + persisted.persistedCounts.events
        + persisted.persistedCounts.relations;

      await stageRunService.succeedStageRun(started.id, {
        outputHash: stableHash({
          persistedCounts: persisted.persistedCounts,
          discardRecords : persisted.discardRecords
        }),
        outputCount,
        skippedCount    : persisted.discardRecords.length,
        promptTokens    : aiResult.usage?.promptTokens ?? null,
        completionTokens: aiResult.usage?.completionTokens ?? null
      });

      return {
        bookId         : input.bookId,
        chapterId      : input.chapter.id,
        runId          : input.runId,
        stageRunId     : started.id,
        rawOutputId    : rawOutput.id,
        modelId        : runtimeModelId ?? aiResult.modelId,
        isFallback     : aiResult.isFallback,
        inputCount     : segments.length,
        outputCount,
        skippedCount   : persisted.discardRecords.length,
        persistedCounts: persisted.persistedCounts,
        discardRecords : persisted.discardRecords
      };
    } catch (error) {
      await stageRunService.failStageRun(
        started.id,
        error,
        failureClass ? { errorClass: failureClass } : {}
      );
      throw error;
    }
  }

  return {
    runStageAForChapter
  };
}

export type StageAExtractionPipeline = ReturnType<typeof createStageAExtractionPipeline>;

export const stageAExtractionPipeline = createStageAExtractionPipeline();
