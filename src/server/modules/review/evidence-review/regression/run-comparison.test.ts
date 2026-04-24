import { describe, expect, it } from "vitest";

import type { ReviewRunCostSummaryDto } from "@/server/modules/review/evidence-review/costs/types";
import { compareReviewRunCostSummaries } from "@/server/modules/review/evidence-review/costs/cost-comparison-service";

import type { ReviewRegressionSnapshot } from "./contracts";
import { compareReviewRegressionRuns } from "./run-comparison";

function createSnapshot(overrides: Partial<ReviewRegressionSnapshot> = {}): ReviewRegressionSnapshot {
  return {
    fixtureKey  : "sanguo-yanyi-comparison",
    bookTitle   : "三国演义",
    chapterRange: { startNo: 1, endNo: 2 },
    personas    : [
      { personaName: "刘备", aliases: ["玄德"] }
    ],
    chapterFacts: [
      {
        personaName     : "刘备",
        chapterNo       : 1,
        factLabel       : "起兵",
        evidenceSnippets: ["刘备起兵"]
      }
    ],
    relations: [
      {
        sourcePersonaName    : "刘备",
        targetPersonaName    : "关羽",
        relationTypeKey      : "sworn_brother.custom",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 2,
        evidenceSnippets     : ["桃园结义"]
      }
    ],
    timeFacts: [
      {
        personaName      : "刘备",
        normalizedLabel  : "黄巾之乱初起",
        timeSortKey      : 10,
        chapterRangeStart: 1,
        chapterRangeEnd  : 1,
        evidenceSnippets : ["时黄巾贼起"]
      }
    ],
    ...overrides
  };
}

function createSummary(overrides: Partial<ReviewRunCostSummaryDto> = {}): ReviewRunCostSummaryDto {
  return {
    runId      : "run-baseline",
    bookId     : "book-sanguo",
    trigger    : "ANALYSIS_JOB",
    scope      : "FULL_BOOK",
    rerunReason: "baseline",
    totals     : {
      promptTokens       : 1000,
      completionTokens   : 300,
      totalTokens        : 1300,
      estimatedCostMicros: BigInt(1300),
      durationMs         : 90000,
      skippedCount       : 0
    },
    stages: [{
      stageKey           : "STAGE_A",
      status             : "SUCCEEDED",
      chapterStartNo     : 1,
      chapterEndNo       : 10,
      promptTokens       : 1000,
      completionTokens   : 300,
      totalTokens        : 1300,
      estimatedCostMicros: BigInt(1300),
      durationMs         : 90000,
      skippedCount       : 0
    }],
    ...overrides
  };
}

describe("compareReviewRegressionRuns", () => {
  it("reports identical snapshots and omits cost comparison when only run ids are supplied", () => {
    // Arrange
    const baselineSnapshot = createSnapshot();
    const candidateSnapshot = createSnapshot();

    // Act
    const comparison = compareReviewRegressionRuns({
      baselineRunId : "run-baseline",
      candidateRunId: "run-candidate",
      baselineSnapshot,
      candidateSnapshot
    });

    // Assert
    expect(comparison).toEqual({
      baselineRunId : "run-baseline",
      candidateRunId: "run-candidate",
      snapshotDiff  : {
        identical  : true,
        addedKeys  : [],
        removedKeys: [],
        changedKeys: []
      },
      costComparison: null
    });
  });

  it("reports added removed changed keys and reuses T19 cost comparison summaries", () => {
    // Arrange
    const baselineSnapshot = createSnapshot();
    const candidateSnapshot = createSnapshot({
      personas: [
        { personaName: "刘备", aliases: ["刘玄德"] }
      ],
      chapterFacts: [],
      relations   : [
        {
          sourcePersonaName    : "刘备",
          targetPersonaName    : "关羽",
          relationTypeKey      : "sworn_brother.custom",
          direction            : "FORWARD",
          effectiveChapterStart: 1,
          effectiveChapterEnd  : 2,
          evidenceSnippets     : ["刘关张结义"]
        }
      ],
      timeFacts: [
        {
          personaName      : "刘备",
          normalizedLabel  : "黄巾之乱初起",
          timeSortKey      : 10,
          chapterRangeStart: 1,
          chapterRangeEnd  : 1,
          evidenceSnippets : ["时黄巾贼起"]
        },
        {
          personaName      : "关羽",
          normalizedLabel  : "桃园结义后",
          timeSortKey      : 20,
          chapterRangeStart: 2,
          chapterRangeEnd  : 2,
          evidenceSnippets : ["桃园结义"]
        }
      ]
    });
    const baselineSummary = createSummary();
    const candidateSummary = createSummary({
      runId      : "run-candidate",
      trigger    : "PROJECTION_REBUILD",
      scope      : "INCREMENTAL",
      rerunReason: "changed chapters",
      totals     : {
        promptTokens       : 400,
        completionTokens   : 100,
        totalTokens        : 500,
        estimatedCostMicros: BigInt(500),
        durationMs         : 30000,
        skippedCount       : 1
      },
      stages: [{
        stageKey           : "STAGE_D",
        status             : "SUCCEEDED",
        chapterStartNo     : 2,
        chapterEndNo       : 2,
        promptTokens       : 400,
        completionTokens   : 100,
        totalTokens        : 500,
        estimatedCostMicros: BigInt(500),
        durationMs         : 30000,
        skippedCount       : 1
      }]
    });

    // Act
    const comparison = compareReviewRegressionRuns({
      baselineSnapshot,
      candidateSnapshot,
      baselineCostSummary : baselineSummary,
      candidateCostSummary: candidateSummary
    });

    // Assert
    expect(comparison).toEqual({
      baselineRunId : "run-baseline",
      candidateRunId: "run-candidate",
      snapshotDiff  : {
        identical: false,
        addedKeys: [
          "timeFacts:关羽\u001f桃园结义后\u001f2\u001f2"
        ],
        removedKeys: [
          "chapterFacts:刘备\u001f1\u001f起兵"
        ],
        changedKeys: [
          "personas:刘备",
          "relations:刘备\u001f关羽\u001fsworn_brother.custom\u001fFORWARD\u001f1\u001f2"
        ]
      },
      costComparison: compareReviewRunCostSummaries(baselineSummary, candidateSummary)
    });
  });

  it("returns null when run ids cannot be resolved from args or cost summaries", () => {
    // Arrange
    const baselineSnapshot = createSnapshot();
    const candidateSnapshot = createSnapshot();

    // Act
    const comparison = compareReviewRegressionRuns({
      baselineSnapshot,
      candidateSnapshot
    });

    // Assert
    expect(comparison).toBeNull();
  });
});
