import { describe, expect, it } from "vitest";

import { renderReviewRunCostComparisonReport } from "@/server/modules/review/evidence-review/costs/report";
import type { ReviewRunCostComparisonDto } from "@/server/modules/review/evidence-review/costs/types";

describe("renderReviewRunCostComparisonReport", () => {
  it("prints reasons, deltas, savings, and skipped stage coverage in a compact text report", () => {
    // Arrange
    const comparison: ReviewRunCostComparisonDto = {
      baseline: {
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
        stages: []
      },
      candidate: {
        runId      : "run-candidate",
        bookId     : "book-1",
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
        stages: []
      },
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
    };

    // Act
    const report = renderReviewRunCostComparisonReport(comparison);

    // Assert
    expect(report).toBe([
      "Review rerun cost comparison",
      "Baseline: run-base | reason=Full-book baseline",
      "Candidate: run-candidate | reason=Projection-only rebuild",
      "Token delta: -750 | savings=75.0%",
      "Cost delta: -750 micros | savings=75.0%",
      "Duration delta: -150000 ms | savings=75.0%",
      "Skipped stage keys: STAGE_0, STAGE_A, STAGE_C"
    ].join("\n"));
  });
});
