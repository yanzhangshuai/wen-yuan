import { describe, expect, it, vi } from "vitest";

import {
  createStageAExtractionPipeline,
  type StageAExtractionPipelineDependencies
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/StageAExtractionPipeline";
import { PipelineStage } from "@/types/pipeline";

const chapter = {
  id     : "chapter-1",
  no     : 1,
  title  : "第一回",
  content: "王冕道：“明日再谈。”次日秦老来访。"
};

const persistedSegments = [
  {
    id            : "segment-1",
    bookId        : "book-1",
    chapterId     : "chapter-1",
    runId         : "run-1",
    segmentIndex  : 0,
    segmentType   : "DIALOGUE_LEAD",
    startOffset   : 0,
    endOffset     : 4,
    rawText       : "王冕道：",
    normalizedText: "王冕道：",
    confidence    : 0.95,
    speakerHint   : "王冕"
  },
  {
    id            : "segment-2",
    bookId        : "book-1",
    chapterId     : "chapter-1",
    runId         : "run-1",
    segmentIndex  : 1,
    segmentType   : "DIALOGUE_CONTENT",
    startOffset   : 4,
    endOffset     : 11,
    rawText       : "“明日再谈。”",
    normalizedText: "“明日再谈。”",
    confidence    : 0.95,
    speakerHint   : "王冕"
  }
] as const;

type StageAAiExecutor = NonNullable<StageAExtractionPipelineDependencies["aiExecutor"]>;
type StageAAiExecuteInput = Parameters<StageAAiExecutor["execute"]>[0];

function createStageRunService() {
  return {
    startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun   : vi.fn().mockResolvedValue(undefined),
    recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-1" })
  };
}

describe("Stage A extraction pipeline", () => {
  it("runs the full chapter extraction path and records raw output", async () => {
    const stageRunService = createStageRunService();
    const normalizer = {
      normalizeChapterExtraction: vi.fn().mockResolvedValue({
        mentionClaims        : [],
        timeClaims           : [],
        pendingEventClaims   : [],
        pendingRelationClaims: [],
        discardRecords       : []
      })
    };
    const persister = {
      persistChapterClaims: vi.fn().mockResolvedValue({
        mentionIdsByRef: {},
        timeIdsByRef   : {},
        persistedCounts: {
          mentions : 1,
          times    : 1,
          events   : 1,
          relations: 1
        },
        discardRecords: []
      })
    };
    const provider = {
      generateJson: vi.fn().mockResolvedValue({
        content: JSON.stringify({
          mentions : [],
          times    : [],
          events   : [],
          relations: []
        }),
        usage: {
          promptTokens    : 11,
          completionTokens: 17,
          totalTokens     : 28
        }
      })
    };
    let executeInput: StageAAiExecuteInput | null = null;
    const aiExecutor: StageAAiExecutor = {
      execute: async (input) => {
        executeInput = input;
        const model = {
          modelId    : "model-1",
          modelName  : "gemini-2.5-flash",
          provider   : "gemini" as const,
          apiKey     : "secret",
          baseUrl    : "https://generativelanguage.googleapis.com",
          displayName: "Gemini Flash",
          source     : "BOOK" as const,
          params     : {
            temperature    : 0.15,
            maxOutputTokens: 4096,
            topP           : 1,
            maxRetries     : 1,
            retryBaseMs    : 200
          }
        };

        const response = await input.callFn({
          model,
          prompt: input.prompt
        });

        return {
          ...response,
          modelId   : model.modelId,
          isFallback: false
        };
      }
    };

    const pipeline = createStageAExtractionPipeline({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue(persistedSegments)
      },
      stageRunService,
      normalizer,
      persister,
      aiExecutor,
      providerFactory: vi.fn(() => provider)
    });

    const result = await pipeline.runStageAForChapter({
      bookId: "book-1",
      runId : "run-1",
      jobId : "job-1",
      chapter
    });

    expect(executeInput).toEqual(
      expect.objectContaining({
        stage    : PipelineStage.INDEPENDENT_EXTRACTION,
        jobId    : "job-1",
        chapterId: "chapter-1",
        context  : { bookId: "book-1", jobId: "job-1" }
      })
    );
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        runId      : "run-1",
        stageRunId : "stage-run-1",
        chapterId  : "chapter-1",
        provider   : "gemini",
        model      : "model-1",
        parseError : null,
        schemaError: null
      })
    );
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith(
      "stage-run-1",
      expect.objectContaining({
        outputCount : 4,
        skippedCount: 0
      })
    );
    expect(result.outputCount).toBe(4);
    expect(result.rawOutputId).toBe("raw-1");
    expect(provider.generateJson).toHaveBeenCalledTimes(1);
  });

  it("records parse errors when the model returns invalid json", async () => {
    const stageRunService = createStageRunService();
    const provider = {
      generateJson: vi.fn().mockResolvedValue({
        content: "{not-json",
        usage  : {
          promptTokens    : 5,
          completionTokens: 7,
          totalTokens     : 12
        }
      })
    };
    const aiExecutor: StageAAiExecutor = {
      execute: async (input) => {
        const model = {
          modelId    : "model-1",
          modelName  : "gemini-2.5-flash",
          provider   : "gemini" as const,
          apiKey     : "secret",
          baseUrl    : "https://generativelanguage.googleapis.com",
          displayName: "Gemini Flash",
          source     : "BOOK" as const,
          params     : {
            temperature    : 0.15,
            maxOutputTokens: 4096,
            topP           : 1,
            maxRetries     : 1,
            retryBaseMs    : 200
          }
        };

        const response = await input.callFn({
          model,
          prompt: { system: "", user: "" }
        });

        return {
          ...response,
          modelId   : model.modelId,
          isFallback: false
        };
      }
    };

    const pipeline = createStageAExtractionPipeline({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue(persistedSegments)
      },
      stageRunService,
      aiExecutor,
      providerFactory: vi.fn(() => provider)
    });

    await expect(
      pipeline.runStageAForChapter({
        bookId: "book-1",
        runId : "run-1",
        jobId : "job-1",
        chapter
      })
    ).rejects.toThrow();

    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(
      expect.objectContaining({
        parseError: expect.stringContaining("Expected")
      })
    );
    expect(stageRunService.failStageRun).toHaveBeenCalledTimes(1);
  });

  it("fails early when Stage 0 persisted segments are missing", async () => {
    const stageRunService = createStageRunService();
    const pipeline = createStageAExtractionPipeline({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue([])
      },
      stageRunService,
      aiExecutor: {
        execute: vi.fn()
      }
    });

    await expect(
      pipeline.runStageAForChapter({
        bookId: "book-1",
        runId : "run-1",
        jobId : "job-1",
        chapter
      })
    ).rejects.toThrow("Stage A requires persisted Stage 0 segments");

    expect(stageRunService.failStageRun).toHaveBeenCalledTimes(1);
  });
});
