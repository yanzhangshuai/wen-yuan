import { Prisma } from "@/generated/prisma/client";
import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  classifyStageRunError,
  createAnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";

function createPrismaMock() {
  return {
    analysisStageRun: {
      create: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      update: vi.fn().mockResolvedValue({ id: "stage-run-1" })
    },
    llmRawOutput: {
      create: vi.fn().mockResolvedValue({ id: "raw-1" })
    }
  };
}

describe("analysis stage run service", () => {
  it("creates a running stage run with chapter range and input count", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    const stageRun = await service.startStageRun({
      runId         : "run-1",
      bookId        : "book-1",
      chapterId     : "chapter-1",
      stageKey      : "STAGE_A",
      attempt       : 2,
      inputHash     : "input-hash",
      inputCount    : 3,
      chapterStartNo: 1,
      chapterEndNo  : 3
    });

    expect(stageRun.id).toBe("stage-run-1");
    expect(prismaMock.analysisStageRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId         : "run-1",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        stageKey      : "STAGE_A",
        attempt       : 2,
        inputHash     : "input-hash",
        inputCount    : 3,
        chapterStartNo: 1,
        chapterEndNo  : 3,
        status        : AnalysisStageRunStatus.RUNNING,
        startedAt     : expect.any(Date),
        finishedAt    : null
      }),
      select: { id: true }
    });
  });

  it("marks a stage run as succeeded with output metrics and usage", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    await service.succeedStageRun("stage-run-1", {
      outputHash         : "output-hash",
      outputCount        : 7,
      skippedCount       : 2,
      promptTokens       : 100,
      completionTokens   : 50,
      estimatedCostMicros: BigInt(3000)
    });

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data : expect.objectContaining({
        status             : AnalysisStageRunStatus.SUCCEEDED,
        outputHash         : "output-hash",
        outputCount        : 7,
        skippedCount       : 2,
        failureCount       : 0,
        errorClass         : null,
        errorMessage       : null,
        promptTokens       : 100,
        completionTokens   : 50,
        totalTokens        : 150,
        estimatedCostMicros: BigInt(3000),
        finishedAt         : expect.any(Date)
      })
    });
  });

  it("marks a stage run as succeeded with default output metrics when usage is omitted", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    await service.succeedStageRun("stage-run-1");

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data : expect.objectContaining({
        outputHash         : null,
        outputCount        : 0,
        skippedCount       : 0,
        promptTokens       : 0,
        completionTokens   : 0,
        totalTokens        : 0,
        estimatedCostMicros: BigInt(0)
      })
    });
  });

  it("marks a failed stage run with error class and bounded message", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    await service.failStageRun("stage-run-1", new Error("schema validation failed"), {
      failureCount: 4,
      errorClass  : "SCHEMA_VALIDATION"
    });

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data : expect.objectContaining({
        status      : AnalysisStageRunStatus.FAILED,
        failureCount: 4,
        errorClass  : "SCHEMA_VALIDATION",
        errorMessage: "schema validation failed",
        finishedAt  : expect.any(Date)
      })
    });
  });

  it("serializes non-error failure messages safely", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    await service.failStageRun("stage-run-1", { reason: "timeout" });

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data : expect.objectContaining({
        failureCount: 1,
        errorClass  : "RETRYABLE_PROVIDER",
        errorMessage: "{\"reason\":\"timeout\"}"
      })
    });
  });

  it("falls back to String(error) when a failure cannot be JSON serialized", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);
    const circular: { self?: unknown } = {};
    circular.self = circular;

    await service.failStageRun("stage-run-1", circular);

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data : expect.objectContaining({
        errorClass  : "UNKNOWN",
        errorMessage: "[object Object]"
      })
    });
  });

  it("marks a stage run as skipped", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    await service.skipStageRun("stage-run-1", 5);

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-1" },
      data : expect.objectContaining({
        status      : AnalysisStageRunStatus.SKIPPED,
        skippedCount: 5,
        finishedAt  : expect.any(Date)
      })
    });
  });

  it("records raw prompt response and parse metadata for later evidence review", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    const raw = await service.recordRawOutput({
      runId              : "run-1",
      stageRunId         : "stage-run-1",
      bookId             : "book-1",
      chapterId          : "chapter-1",
      provider           : "openai-compatible",
      model              : "model-x",
      requestPayload     : { messages: [{ role: "user", content: "extract" }] },
      responseText       : "{\"items\":[]}",
      responseJson       : { items: [] },
      parseError         : null,
      schemaError        : "missing evidenceSpanIds",
      discardReason      : "schema_error",
      promptTokens       : 10,
      completionTokens   : 6,
      durationMs         : 123,
      estimatedCostMicros: null
    });

    expect(raw.id).toBe("raw-1");
    expect(prismaMock.llmRawOutput.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId              : "run-1",
        stageRunId         : "stage-run-1",
        bookId             : "book-1",
        chapterId          : "chapter-1",
        provider           : "openai-compatible",
        model              : "model-x",
        requestPayload     : { messages: [{ role: "user", content: "extract" }] },
        responseText       : "{\"items\":[]}",
        responseJson       : { items: [] },
        parseError         : null,
        schemaError        : "missing evidenceSpanIds",
        discardReason      : "schema_error",
        promptTokens       : 10,
        completionTokens   : 6,
        totalTokens        : 16,
        durationMs         : 123,
        estimatedCostMicros: null
      }),
      select: { id: true }
    });
  });

  it("keeps raw totalTokens null when prompt and completion usage are both unknown", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisStageRunService(prismaMock);

    await service.recordRawOutput({
      runId         : "run-1",
      stageRunId    : "stage-run-1",
      bookId        : "book-1",
      provider      : "openai-compatible",
      model         : "model-x",
      requestPayload: { foo: "bar" },
      responseText  : "{}"
    });

    expect(prismaMock.llmRawOutput.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        promptTokens       : null,
        completionTokens   : null,
        totalTokens        : null,
        estimatedCostMicros: null
      }),
      select: { id: true }
    });
  });

  it("classifies common retry and validation failures", () => {
    expect(classifyStageRunError(new Error("429 rate limit"))).toBe("RETRYABLE_PROVIDER");
    expect(classifyStageRunError("temporary network timeout")).toBe("RETRYABLE_PROVIDER");
    expect(classifyStageRunError(new Error("JSON parse error"))).toBe("PARSE_ERROR");
    expect(classifyStageRunError(new Error("schema validation failed"))).toBe("SCHEMA_VALIDATION");
    expect(classifyStageRunError(new Error("operation cancelled by user"))).toBe("CANCELED");
    expect(classifyStageRunError(new Error("operation canceled by user"))).toBe("CANCELED");
    expect(classifyStageRunError(new Error("provider exhausted fallback chain"))).toBe("PROVIDER_EXHAUSTED");
    expect(classifyStageRunError(new Error("unknown"))).toBe("UNKNOWN");
  });

  it("keeps null-object behavior when stage delegates are missing", async () => {
    const service = createAnalysisStageRunService({
      llmRawOutput: {
        create: vi.fn()
      }
    });

    await expect(service.startStageRun({
      runId   : "run-1",
      bookId  : "book-1",
      stageKey: "STAGE_A"
    })).resolves.toEqual({ id: null });
    await expect(service.succeedStageRun("stage-run-1")).resolves.toBeUndefined();
    await expect(service.failStageRun("stage-run-1", "boom")).resolves.toBeUndefined();
    await expect(service.skipStageRun("stage-run-1")).resolves.toBeUndefined();
  });

  it("keeps null-object behavior when raw output delegate is missing or runId is null", async () => {
    const service = createAnalysisStageRunService({
      analysisStageRun: {
        create: vi.fn(),
        update: vi.fn()
      }
    });

    await expect(service.recordRawOutput({
      runId         : "run-1",
      bookId        : "book-1",
      provider      : "openai-compatible",
      model         : "model-x",
      requestPayload: {},
      responseText  : "{}"
    })).resolves.toEqual({ id: null });

    const prismaMock = createPrismaMock();
    const runIdNullService = createAnalysisStageRunService(prismaMock);
    await expect(runIdNullService.startStageRun({
      runId   : null,
      bookId  : "book-1",
      stageKey: "STAGE_A"
    })).resolves.toEqual({ id: null });
    await expect(runIdNullService.recordRawOutput({
      runId         : null,
      bookId        : "book-1",
      provider      : "openai-compatible",
      model         : "model-x",
      requestPayload: {},
      responseText  : "{}"
    })).resolves.toEqual({ id: null });
    expect(prismaMock.analysisStageRun.create).not.toHaveBeenCalled();
    expect(prismaMock.llmRawOutput.create).not.toHaveBeenCalled();
  });

  it("uses the default prisma adapter when no client override is provided", async () => {
    const prismaMock = createPrismaMock();

    vi.resetModules();
    vi.doMock("@/server/db/prisma", () => ({
      prisma: prismaMock
    }));

    const { analysisStageRunService: defaultService } = await import(
      "@/server/modules/analysis/runs/stage-run-service"
    );

    await defaultService.startStageRun({
      runId   : "run-1",
      bookId  : "book-1",
      stageKey: "STAGE_A"
    });
    await defaultService.succeedStageRun("stage-run-1");
    await defaultService.recordRawOutput({
      runId         : "run-1",
      bookId        : "book-1",
      provider      : "openai-compatible",
      model         : "model-x",
      requestPayload: {},
      responseText  : "{}",
      responseJson  : null
    });

    expect(prismaMock.analysisStageRun.create).toHaveBeenCalledOnce();
    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledOnce();
    expect(prismaMock.llmRawOutput.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        responseJson: Prisma.DbNull
      }),
      select: { id: true }
    });
  });
});
