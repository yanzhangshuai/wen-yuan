import type {
  ReviewRunCostComparisonDto,
  ReviewRunCostStageDto,
  ReviewRunCostSummaryDto,
  ReviewRunCostTotalsDto
} from "@/server/modules/review/evidence-review/costs";

interface SerializedReviewRunCostTotals {
  promptTokens       : number;
  completionTokens   : number;
  totalTokens        : number;
  estimatedCostMicros: string;
  durationMs         : number;
  skippedCount       : number;
}

interface SerializedReviewRunCostStage extends SerializedReviewRunCostTotals {
  stageKey      : string;
  status        : string;
  chapterStartNo: number | null;
  chapterEndNo  : number | null;
}

export interface SerializedReviewRunCostSummary {
  runId      : string;
  bookId     : string;
  trigger    : string;
  scope      : string;
  rerunReason: string | null;
  totals     : SerializedReviewRunCostTotals;
  stages     : SerializedReviewRunCostStage[];
}

export interface SerializedReviewRunCostComparison {
  baseline     : SerializedReviewRunCostSummary;
  candidate    : SerializedReviewRunCostSummary;
  delta        : SerializedReviewRunCostTotals;
  savings      : ReviewRunCostComparisonDto["savings"];
  stageCoverage: ReviewRunCostComparisonDto["stageCoverage"];
}

function serializeTotals(totals: ReviewRunCostTotalsDto): SerializedReviewRunCostTotals {
  return {
    promptTokens       : totals.promptTokens,
    completionTokens   : totals.completionTokens,
    totalTokens        : totals.totalTokens,
    estimatedCostMicros: totals.estimatedCostMicros.toString(),
    durationMs         : totals.durationMs,
    skippedCount       : totals.skippedCount
  };
}

function serializeStage(stage: ReviewRunCostStageDto): SerializedReviewRunCostStage {
  return {
    stageKey      : stage.stageKey,
    status        : stage.status,
    chapterStartNo: stage.chapterStartNo,
    chapterEndNo  : stage.chapterEndNo,
    ...serializeTotals(stage)
  };
}

export function serializeReviewRunCostSummary(
  summary: ReviewRunCostSummaryDto
): SerializedReviewRunCostSummary {
  return {
    runId      : summary.runId,
    bookId     : summary.bookId,
    trigger    : summary.trigger,
    scope      : summary.scope,
    rerunReason: summary.rerunReason,
    totals     : serializeTotals(summary.totals),
    stages     : summary.stages.map(serializeStage)
  };
}

export function serializeReviewRunCostComparison(
  comparison: ReviewRunCostComparisonDto
): SerializedReviewRunCostComparison {
  return {
    baseline     : serializeReviewRunCostSummary(comparison.baseline),
    candidate    : serializeReviewRunCostSummary(comparison.candidate),
    delta        : serializeTotals(comparison.delta),
    savings      : comparison.savings,
    stageCoverage: comparison.stageCoverage
  };
}
