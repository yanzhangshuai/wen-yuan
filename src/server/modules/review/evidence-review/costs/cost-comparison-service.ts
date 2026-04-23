import type {
  ReviewRunCostComparisonDto,
  ReviewRunCostSummaryDto,
  ReviewRunCostTotalsDto
} from "@/server/modules/review/evidence-review/costs/types";

function uniqueStageKeys(summary: ReviewRunCostSummaryDto): string[] {
  return Array.from(new Set(summary.stages.map((stage) => stage.stageKey)));
}

function toSavingsPct(baseline: number, candidate: number): number | null {
  if (baseline <= 0) {
    return null;
  }

  return Number((((baseline - candidate) / baseline) * 100).toFixed(1));
}

function toBigIntSavingsPct(baseline: bigint, candidate: bigint): number | null {
  if (baseline <= BigInt(0)) {
    return null;
  }

  return Number((Number(baseline - candidate) / Number(baseline) * 100).toFixed(1));
}

function buildDelta(
  baseline: ReviewRunCostSummaryDto,
  candidate: ReviewRunCostSummaryDto
): ReviewRunCostTotalsDto {
  return {
    promptTokens       : candidate.totals.promptTokens - baseline.totals.promptTokens,
    completionTokens   : candidate.totals.completionTokens - baseline.totals.completionTokens,
    totalTokens        : candidate.totals.totalTokens - baseline.totals.totalTokens,
    estimatedCostMicros: candidate.totals.estimatedCostMicros - baseline.totals.estimatedCostMicros,
    durationMs         : candidate.totals.durationMs - baseline.totals.durationMs,
    skippedCount       : candidate.totals.skippedCount - baseline.totals.skippedCount
  };
}

/**
 * 基于两个已汇总的 run 成本 DTO 计算节省比例与阶段覆盖差异，避免重复触达 DB。
 */
export function compareReviewRunCostSummaries(
  baseline: ReviewRunCostSummaryDto,
  candidate: ReviewRunCostSummaryDto
): ReviewRunCostComparisonDto {
  const baselineStageKeys = uniqueStageKeys(baseline);
  const candidateStageKeys = uniqueStageKeys(candidate);
  const candidateStageKeySet = new Set(candidateStageKeys);

  return {
    baseline,
    candidate,
    delta  : buildDelta(baseline, candidate),
    savings: {
      totalTokenSavingsPct: toSavingsPct(baseline.totals.totalTokens, candidate.totals.totalTokens),
      costSavingsPct      : toBigIntSavingsPct(
        baseline.totals.estimatedCostMicros,
        candidate.totals.estimatedCostMicros
      ),
      durationSavingsPct: toSavingsPct(baseline.totals.durationMs, candidate.totals.durationMs)
    },
    stageCoverage: {
      baselineStageKeys,
      candidateStageKeys,
      skippedStageKeys: baselineStageKeys.filter((stageKey) => !candidateStageKeySet.has(stageKey))
    }
  };
}
