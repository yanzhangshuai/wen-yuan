import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisRunService } from "@/server/modules/analysis/runs/run-service";

function createPrismaMock() {
  return {
    analysisRun: {
      create   : vi.fn().mockResolvedValue({ id: "run-1" }),
      update   : vi.fn().mockResolvedValue({ id: "run-1" }),
      findFirst: vi.fn().mockResolvedValue({ id: "run-1" })
    },
    llmRawOutput: {
      aggregate: vi.fn().mockResolvedValue({
        _sum: {
          promptTokens       : 120,
          completionTokens   : 80,
          totalTokens        : 200,
          estimatedCostMicros: BigInt(4500)
        }
      })
    }
  };
}

describe("analysis run service", () => {
  it("createJobRun creates RUNNING run with expected fields", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    const result = await service.createJobRun({
      jobId  : "job-1",
      bookId : "book-1",
      scope  : "FULL_BOOK",
      trigger: "ANALYSIS_JOB"
    });

    expect(result).toEqual({ id: "run-1" });
    expect(prismaMock.analysisRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId           : "job-1",
        bookId          : "book-1",
        scope           : "FULL_BOOK",
        trigger         : "ANALYSIS_JOB",
        status          : AnalysisJobStatus.RUNNING,
        startedAt       : expect.any(Date),
        finishedAt      : null,
        currentStageKey : null,
        errorMessage    : null
      }),
      select: { id: true }
    });
  });

  it("markCurrentStage only updates currentStageKey", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    await service.markCurrentStage("run-1", "stage-a");

    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : { currentStageKey: "stage-a" }
    });
  });

  it("succeedRun summarizes llm output and writes tokens/cost to AnalysisRun", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    await service.succeedRun("run-1");

    expect(prismaMock.llmRawOutput.aggregate).toHaveBeenCalledWith({
      where: { runId: "run-1" },
      _sum : {
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true
      }
    });
    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : expect.objectContaining({
        status             : AnalysisJobStatus.SUCCEEDED,
        currentStageKey    : null,
        errorMessage       : null,
        finishedAt         : expect.any(Date),
        promptTokens       : 120,
        completionTokens   : 80,
        totalTokens        : 200,
        estimatedCostMicros: BigInt(4500)
      })
    });
  });

  it("failRun truncates error message to 1000 chars", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);
    const longError = new Error("x".repeat(2000));

    await service.failRun("run-1", longError);

    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : expect.objectContaining({
        status         : AnalysisJobStatus.FAILED,
        currentStageKey: null,
        finishedAt     : expect.any(Date),
        errorMessage   : "x".repeat(1000)
      })
    });
  });

  it("cancelRun marks run as CANCELED", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    await service.cancelRun("run-1");

    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : expect.objectContaining({
        status         : AnalysisJobStatus.CANCELED,
        currentStageKey: null,
        errorMessage   : null,
        finishedAt     : expect.any(Date)
      })
    });
  });

  it("uses null-object behavior when analysisRun delegate is missing", async () => {
    const service = createAnalysisRunService({
      llmRawOutput: {
        aggregate: vi.fn()
      }
    } as never);

    await expect(service.createJobRun({
      jobId  : "job-1",
      bookId : "book-1",
      scope  : "FULL_BOOK",
      trigger: "ANALYSIS_JOB"
    })).resolves.toEqual({ id: null });
  });

  it("summarizeRun returns zeros when llmRawOutput delegate is missing", async () => {
    const service = createAnalysisRunService({
      analysisRun: {
        create   : vi.fn(),
        update   : vi.fn(),
        findFirst: vi.fn()
      }
    } as never);

    await expect(service.summarizeRun("run-1")).resolves.toEqual({
      promptTokens       : 0,
      completionTokens   : 0,
      totalTokens        : 0,
      estimatedCostMicros: BigInt(0)
    });
  });

  it("normalizes nullable/number aggregates in summarizeRun", async () => {
    const prismaMock = createPrismaMock();
    prismaMock.llmRawOutput.aggregate.mockResolvedValueOnce({
      _sum: {
        promptTokens       : null,
        completionTokens   : undefined,
        totalTokens        : 12,
        estimatedCostMicros: 34
      }
    });
    const service = createAnalysisRunService(prismaMock as never);

    await expect(service.summarizeRun("run-2")).resolves.toEqual({
      promptTokens       : 0,
      completionTokens   : 0,
      totalTokens        : 12,
      estimatedCostMicros: BigInt(34)
    });
  });

  it("failRun safely stringifies unknown error payload", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    await service.failRun("run-1", { code: "E_UNKNOWN" });

    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : expect.objectContaining({
        errorMessage: "[object Object]"
      })
    });
  });

  it("failRun uses raw string message as-is", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    await service.failRun("run-1", "plain-message");

    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : expect.objectContaining({
        errorMessage: "plain-message"
      })
    });
  });

  it("failRun falls back to String(error) when JSON.stringify throws", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);
    const circular: { self?: unknown } = {};
    circular.self = circular;

    await service.failRun("run-1", circular);

    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-1" },
      data : expect.objectContaining({
        errorMessage: expect.stringContaining("[object Object]")
      })
    });
  });

  it("returns no-op for stage/status updates when analysisRun delegate is missing", async () => {
    const service = createAnalysisRunService({
      llmRawOutput: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: {
            promptTokens       : 1,
            completionTokens   : 2,
            totalTokens        : 3,
            estimatedCostMicros: BigInt(4)
          }
        })
      }
    } as never);

    await expect(service.markCurrentStage("run-1", "stage-b")).resolves.toBeUndefined();
    await expect(service.succeedRun("run-1")).resolves.toBeUndefined();
    await expect(service.failRun("run-1", "oops")).resolves.toBeUndefined();
    await expect(service.cancelRun("run-1")).resolves.toBeUndefined();
  });

  it("keeps null-object flow when createJobRun returns null id and then succeedRun is called", async () => {
    const service = createAnalysisRunService({
      llmRawOutput: {
        aggregate: vi.fn()
      }
    } as never);

    const run = await service.createJobRun({
      jobId  : "job-1",
      bookId : "book-1",
      scope  : "FULL_BOOK",
      trigger: "ANALYSIS_JOB"
    });
    await expect(service.succeedRun(run.id)).resolves.toBeUndefined();
  });

  it("returns zero summary and no-op updates for null runId", async () => {
    const prismaMock = createPrismaMock();
    const service = createAnalysisRunService(prismaMock as never);

    await expect(service.markCurrentStage(null, "stage-z")).resolves.toBeUndefined();
    await expect(service.summarizeRun(null)).resolves.toEqual({
      promptTokens       : 0,
      completionTokens   : 0,
      totalTokens        : 0,
      estimatedCostMicros: BigInt(0)
    });
    await expect(service.succeedRun(null)).resolves.toBeUndefined();
    await expect(service.failRun(null, "oops")).resolves.toBeUndefined();
    await expect(service.cancelRun(null)).resolves.toBeUndefined();

    expect(prismaMock.analysisRun.update).not.toHaveBeenCalled();
    expect(prismaMock.llmRawOutput.aggregate).not.toHaveBeenCalled();
  });
});
