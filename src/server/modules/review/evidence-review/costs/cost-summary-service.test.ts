import { describe, expect, it, vi } from "vitest";

import {
  ReviewRunCostSummaryNotFoundError,
  createReviewRunCostSummaryService
} from "@/server/modules/review/evidence-review/costs/cost-summary-service";

function createRepositoryMock() {
  return {
    analysisRun: {
      findUnique: vi.fn()
    },
    analysisStageRun: {
      findMany: vi.fn()
    }
  };
}

describe("createReviewRunCostSummaryService", () => {
  it("prefers run-level totals, computes stage durations, and derives chapter rerun reasons", async () => {
    // Arrange
    const repository = createRepositoryMock();
    repository.analysisRun.findUnique.mockResolvedValue({
      id                 : "run-1",
      bookId             : "book-1",
      trigger            : "RETRY_CHAPTER",
      scope              : "CHAPTER_LIST",
      startedAt          : new Date("2026-04-23T10:00:00.000Z"),
      finishedAt         : new Date("2026-04-23T10:12:00.000Z"),
      promptTokens       : 100,
      completionTokens   : 40,
      totalTokens        : 140,
      estimatedCostMicros: BigInt(900)
    });
    repository.analysisStageRun.findMany.mockResolvedValue([
      {
        stageKey           : "STAGE_0",
        status             : "SUCCEEDED",
        chapterStartNo     : 3,
        chapterEndNo       : 5,
        promptTokens       : 11,
        completionTokens   : 4,
        totalTokens        : 15,
        estimatedCostMicros: BigInt(100),
        skippedCount       : 2,
        startedAt          : new Date("2026-04-23T10:00:00.000Z"),
        finishedAt         : new Date("2026-04-23T10:02:00.000Z"),
        createdAt          : new Date("2026-04-23T10:00:00.000Z")
      },
      {
        stageKey           : "stage_a_extraction",
        status             : "SUCCEEDED",
        chapterStartNo     : 3,
        chapterEndNo       : 5,
        promptTokens       : 12,
        completionTokens   : 6,
        totalTokens        : 18,
        estimatedCostMicros: BigInt(120),
        skippedCount       : 1,
        startedAt          : new Date("2026-04-23T10:02:00.000Z"),
        finishedAt         : new Date("2026-04-23T10:05:00.000Z"),
        createdAt          : new Date("2026-04-23T10:02:00.000Z")
      },
      {
        stageKey           : "stage_b_identity_resolution",
        status             : "SUCCEEDED",
        chapterStartNo     : null,
        chapterEndNo       : null,
        promptTokens       : 20,
        completionTokens   : 8,
        totalTokens        : 28,
        estimatedCostMicros: BigInt(210),
        skippedCount       : 0,
        startedAt          : new Date("2026-04-23T10:05:00.000Z"),
        finishedAt         : new Date("2026-04-23T10:08:00.000Z"),
        createdAt          : new Date("2026-04-23T10:05:00.000Z")
      },
      {
        stageKey           : "stage_c_fact_attribution",
        status             : "SUCCEEDED",
        chapterStartNo     : null,
        chapterEndNo       : null,
        promptTokens       : 18,
        completionTokens   : 7,
        totalTokens        : 25,
        estimatedCostMicros: BigInt(180),
        skippedCount       : 3,
        startedAt          : new Date("2026-04-23T10:08:00.000Z"),
        finishedAt         : new Date("2026-04-23T10:11:00.000Z"),
        createdAt          : new Date("2026-04-23T10:08:00.000Z")
      }
    ]);
    const service = createReviewRunCostSummaryService(repository as never);

    // Act
    const summary = await service.getSummary("run-1");

    // Assert
    expect(repository.analysisRun.findUnique).toHaveBeenCalledWith({
      where : { id: "run-1" },
      select: expect.any(Object)
    });
    expect(repository.analysisStageRun.findMany).toHaveBeenCalledWith({
      where  : { runId: "run-1" },
      orderBy: [{ createdAt: "asc" }, { stageKey: "asc" }],
      select : expect.any(Object)
    });
    expect(summary).toEqual({
      runId      : "run-1",
      bookId     : "book-1",
      trigger    : "RETRY_CHAPTER",
      scope      : "CHAPTER_LIST",
      rerunReason: "Chapter-local extraction + full-book resolution",
      totals     : {
        promptTokens       : 100,
        completionTokens   : 40,
        totalTokens        : 140,
        estimatedCostMicros: BigInt(900),
        durationMs         : 720000,
        skippedCount       : 6
      },
      stages: [
        {
          stageKey           : "STAGE_0",
          status             : "SUCCEEDED",
          chapterStartNo     : 3,
          chapterEndNo       : 5,
          promptTokens       : 11,
          completionTokens   : 4,
          totalTokens        : 15,
          estimatedCostMicros: BigInt(100),
          durationMs         : 120000,
          skippedCount       : 2
        },
        {
          stageKey           : "STAGE_A",
          status             : "SUCCEEDED",
          chapterStartNo     : 3,
          chapterEndNo       : 5,
          promptTokens       : 12,
          completionTokens   : 6,
          totalTokens        : 18,
          estimatedCostMicros: BigInt(120),
          durationMs         : 180000,
          skippedCount       : 1
        },
        {
          stageKey           : "STAGE_B",
          status             : "SUCCEEDED",
          chapterStartNo     : null,
          chapterEndNo       : null,
          promptTokens       : 20,
          completionTokens   : 8,
          totalTokens        : 28,
          estimatedCostMicros: BigInt(210),
          durationMs         : 180000,
          skippedCount       : 0
        },
        {
          stageKey           : "STAGE_C",
          status             : "SUCCEEDED",
          chapterStartNo     : null,
          chapterEndNo       : null,
          promptTokens       : 18,
          completionTokens   : 7,
          totalTokens        : 25,
          estimatedCostMicros: BigInt(180),
          durationMs         : 180000,
          skippedCount       : 3
        }
      ]
    });
  });

  it("falls back to stage totals and treats nullable usage fields as zero", async () => {
    // Arrange
    const repository = createRepositoryMock();
    repository.analysisRun.findUnique.mockResolvedValue({
      id                 : "run-2",
      bookId             : "book-1",
      trigger            : "PROJECTION_REBUILD",
      scope              : "PROJECTION_ONLY",
      startedAt          : null,
      finishedAt         : null,
      promptTokens       : 0,
      completionTokens   : 0,
      totalTokens        : 0,
      estimatedCostMicros: BigInt(0)
    });
    repository.analysisStageRun.findMany.mockResolvedValue([
      {
        stageKey           : "STAGE_D",
        status             : "SUCCEEDED",
        chapterStartNo     : null,
        chapterEndNo       : null,
        promptTokens       : null,
        completionTokens   : 5,
        totalTokens        : null,
        estimatedCostMicros: null,
        skippedCount       : null,
        startedAt          : new Date("2026-04-23T11:00:00.000Z"),
        finishedAt         : new Date("2026-04-23T11:01:30.000Z"),
        createdAt          : new Date("2026-04-23T11:00:00.000Z")
      }
    ]);
    const service = createReviewRunCostSummaryService(repository as never);

    // Act
    const summary = await service.getSummary("run-2");

    // Assert
    expect(summary).toEqual({
      runId      : "run-2",
      bookId     : "book-1",
      trigger    : "PROJECTION_REBUILD",
      scope      : "PROJECTION_ONLY",
      rerunReason: "Projection-only rebuild",
      totals     : {
        promptTokens       : 0,
        completionTokens   : 5,
        totalTokens        : 5,
        estimatedCostMicros: BigInt(0),
        durationMs         : 90000,
        skippedCount       : 0
      },
      stages: [
        {
          stageKey           : "STAGE_D",
          status             : "SUCCEEDED",
          chapterStartNo     : null,
          chapterEndNo       : null,
          promptTokens       : 0,
          completionTokens   : 5,
          totalTokens        : 5,
          estimatedCostMicros: BigInt(0),
          durationMs         : 90000,
          skippedCount       : 0
        }
      ]
    });
  });

  it("returns null rerunReason when trigger metadata cannot safely explain the observed stage coverage", async () => {
    // Arrange
    const repository = createRepositoryMock();
    repository.analysisRun.findUnique.mockResolvedValue({
      id                 : "run-3",
      bookId             : "book-1",
      trigger            : "RETRY_RUN",
      scope              : "FULL_BOOK",
      startedAt          : new Date("2026-04-23T12:00:00.000Z"),
      finishedAt         : new Date("2026-04-23T12:04:00.000Z"),
      promptTokens       : 0,
      completionTokens   : 0,
      totalTokens        : 0,
      estimatedCostMicros: BigInt(0)
    });
    repository.analysisStageRun.findMany.mockResolvedValue([
      {
        stageKey           : "stage_b_identity_resolution",
        status             : "SUCCEEDED",
        chapterStartNo     : null,
        chapterEndNo       : null,
        promptTokens       : 13,
        completionTokens   : 7,
        totalTokens        : 20,
        estimatedCostMicros: BigInt(150),
        skippedCount       : 0,
        startedAt          : new Date("2026-04-23T12:00:00.000Z"),
        finishedAt         : new Date("2026-04-23T12:04:00.000Z"),
        createdAt          : new Date("2026-04-23T12:00:00.000Z")
      }
    ]);
    const service = createReviewRunCostSummaryService(repository as never);

    // Act
    const summary = await service.getSummary("run-3");

    // Assert
    expect(summary.rerunReason).toBeNull();
  });

  it("throws a not-found error when the requested run does not exist", async () => {
    // Arrange
    const repository = createRepositoryMock();
    repository.analysisRun.findUnique.mockResolvedValue(null);
    const service = createReviewRunCostSummaryService(repository as never);

    // Act / Assert
    await expect(service.getSummary("missing-run")).rejects.toThrow(ReviewRunCostSummaryNotFoundError);
    await expect(service.getSummary("missing-run")).rejects.toThrow("Review run not found: missing-run");
  });
});
