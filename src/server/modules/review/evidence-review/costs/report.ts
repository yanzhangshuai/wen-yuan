import type { ReviewRunCostComparisonDto } from "@/server/modules/review/evidence-review/costs/types";

function formatSavingsPct(value: number | null): string {
  if (value === null) {
    return "n/a";
  }

  return `${value.toFixed(1)}%`;
}

/**
 * 为回归脚本与人工排查输出紧凑文本，避免每次都手工比对 JSON delta。
 */
export function renderReviewRunCostComparisonReport(
  comparison: ReviewRunCostComparisonDto
): string {
  return [
    "Review rerun cost comparison",
    `Baseline: ${comparison.baseline.runId} | reason=${comparison.baseline.rerunReason ?? "n/a"}`,
    `Candidate: ${comparison.candidate.runId} | reason=${comparison.candidate.rerunReason ?? "n/a"}`,
    `Token delta: ${comparison.delta.totalTokens} | savings=${formatSavingsPct(comparison.savings.totalTokenSavingsPct)}`,
    `Cost delta: ${comparison.delta.estimatedCostMicros.toString()} micros | savings=${formatSavingsPct(comparison.savings.costSavingsPct)}`,
    `Duration delta: ${comparison.delta.durationMs} ms | savings=${formatSavingsPct(comparison.savings.durationSavingsPct)}`,
    `Skipped stage keys: ${comparison.stageCoverage.skippedStageKeys.join(", ")}`
  ].join("\n");
}
