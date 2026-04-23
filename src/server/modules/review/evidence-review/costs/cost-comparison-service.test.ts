import { describe, expect, it } from "vitest";

import type { ReviewRunCostSummaryDto } from "@/server/modules/review/evidence-review/costs/types";
import { compareReviewRunCostSummaries } from "@/server/modules/review/evidence-review/costs/cost-comparison-service";

function createSummary(
  overrides: Partial<ReviewRunCostSummaryDto> = {}
): ReviewRunCostSummaryDto {
  return {
    runId      : "run-base",
    bookId     : "book-1",
    trigger    : "ANALYSIS_JOB",
    scope      : "FULL_BOOK",
    rerunReason: "Full-book baseline",
    totals     : {
      promptTokens       : 800,
      completionTokens   : 200,
      totalTokens        : 1000,
      estimatedCostMicros: BigInt(1000),
      durationMs         : 200000,
      skippedCount       : 0
    },
    stages: [
      {
        stageKey           : "STAGE_0",
        status             : "SUCCEEDED",
        chapterStartNo     : 1,
        chapterEndNo       : 20,
        promptTokens       : 100,
        completionTokens   : 30,
        totalTokens        : 130,
        estimatedCostMicros: BigInt(120),
        durationMs         : 10000,
        skippedCount       : 0
      },
      {
        stageKey           : "STAGE_A",
        status             : "SUCCEEDED",
        chapterStartNo     : 1,
        chapterEndNo       : 20,
        promptTokens       : 120,
        completionTokens   : 40,
        totalTokens        : 160,
        estimatedCostMicros: BigInt(180),
        durationMs         : 20000,
        skippedCount       : 0
      },
      {
        stageKey           : "STAGE_C",
        status             : "SUCCEEDED",
        chapterStartNo     : 1,
        chapterEndNo       : 20,
        promptTokens       : 200,
        completionTokens   : 60,
        totalTokens        : 260,
        estimatedCostMicros: BigInt(260),
        durationMs         : 30000,
        skippedCount       : 0
      },
      {
        stageKey           : "STAGE_C",
        status             : "SUCCEEDED",
        chapterStartNo     : 1,
        chapterEndNo       : 20,
        promptTokens       : 180,
        completionTokens   : 50,
        totalTokens        : 230,
        estimatedCostMicros: BigInt(240),
        durationMs         : 25000,
        skippedCount       : 0
      }
    ],
    ...overrides
  };
}

describe("compareReviewRunCostSummaries", () => {
  it("computes candidate-minus-baseline deltas, savings percentages, and unique stage coverage", () => {
    // Arrange
    const baseline = createSummary();
    const candidate = createSummary({
      runId      : "run-candidate",
      trigger    : "PROJECTION_REBUILD",
      scope      : "PROJECTION_ONLY",
      rerunReason: "Projection-only rebuild",
      totals     : {
        promptTokens       : 200,
        completionTokens   : 50,
        totalTokens        : 250,
        estimatedCostMicros: BigInt(250),
        durationMs         : 50000,
        skippedCount       : 2
      },
      stages: [
        {
          stageKey           : "STAGE_D",
          status             : "SUCCEEDED",
          chapterStartNo     : null,
          chapterEndNo       : null,
          promptTokens       : 200,
          completionTokens   : 50,
          totalTokens        : 250,
          estimatedCostMicros: BigInt(250),
          durationMs         : 50000,
          skippedCount       : 2
        }
      ]
    });

    // Act
    const comparison = compareReviewRunCostSummaries(baseline, candidate);

    // Assert
    expect(comparison).toEqual({
      baseline,
      candidate,
      delta: {
        promptTokens       : -600,
        completionTokens   : -150,
        totalTokens        : -750,
        estimatedCostMicros: BigInt(-750),
        durationMs         : -150000,
        skippedCount       : 2
      },
      savings: {
        totalTokenSavingsPct: 75,
        costSavingsPct      : 75,
        durationSavingsPct  : 75
      },
      stageCoverage: {
        baselineStageKeys : ["STAGE_0", "STAGE_A", "STAGE_C"],
        candidateStageKeys: ["STAGE_D"],
        skippedStageKeys  : ["STAGE_0", "STAGE_A", "STAGE_C"]
      }
    });
  });

  it("returns null savings percentages when the baseline totals are zero", () => {
    // Arrange
    const baseline = createSummary({
      totals: {
        promptTokens       : 0,
        completionTokens   : 0,
        totalTokens        : 0,
        estimatedCostMicros: BigInt(0),
        durationMs         : 0,
        skippedCount       : 0
      }
    });
    const candidate = createSummary({
      totals: {
        promptTokens       : 12,
        completionTokens   : 4,
        totalTokens        : 16,
        estimatedCostMicros: BigInt(20),
        durationMs         : 2000,
        skippedCount       : 1
      }
    });

    // Act
    const comparison = compareReviewRunCostSummaries(baseline, candidate);

    // Assert
    expect(comparison.savings).toEqual({
      totalTokenSavingsPct: null,
      costSavingsPct      : null,
      durationSavingsPct  : null
    });
  });
});
