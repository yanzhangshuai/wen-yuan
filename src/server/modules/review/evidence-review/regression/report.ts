import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReviewRunCostSummaryDto } from "@/server/modules/review/evidence-review/costs/types";
import { reviewRunCostSummaryService } from "@/server/modules/review/evidence-review/costs";

import type {
  ReviewRegressionActionResult
} from "./review-action-harness";
import { runReviewRegressionActionScenarios } from "./review-action-harness";
import type {
  ReviewRegressionFixture,
  ReviewRegressionMetricSummary,
  ReviewRegressionReport,
  ReviewRegressionRunComparison
} from "./contracts";
import { reviewRegressionReportSchema } from "./contracts";
import { loadReviewRegressionFixture } from "./fixture-loader";
import { evaluateReviewRegressionFixture } from "./metrics";
import { compareReviewRegressionRuns } from "./run-comparison";
import {
  createReviewRegressionSnapshotRepository,
  type ReviewRegressionSnapshotRepository
} from "./snapshot-repository";
import {
  buildCurrentReviewRegressionSnapshot,
  buildRunScopedReviewRegressionSnapshot
} from "./snapshot-builder";

const DEFAULT_REPORT_ROOT = "docs/superpowers/reports/review-regression";
const DEFAULT_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000021";

export interface ReviewRegressionReportPaths {
  reportDir   : string;
  markdownPath: string;
  jsonPath    : string;
}

export interface CreateReviewRegressionReportInput {
  command       : string;
  fixturePath   : string;
  fixture       : ReviewRegressionFixture;
  metrics       : ReviewRegressionMetricSummary;
  missingKeys   : string[];
  unexpectedKeys: string[];
  changedKeys   : string[];
  actionResults : ReviewRegressionActionResult[];
  runComparison : ReviewRegressionRunComparison | null;
  generatedAt   : Date;
  reportDir?    : string;
}

export interface WriteReviewRegressionReportResult {
  markdownPath: string;
  jsonPath    : string;
}

export interface ReviewRegressionCostSummaryService {
  getSummary(runId: string): Promise<ReviewRunCostSummaryDto>;
}

export interface RunReviewGoldSetRegressionInput {
  fixturePath        : string;
  reportDir?         : string;
  chapterStartNo?    : number;
  chapterEndNo?      : number;
  baselineRunId?     : string;
  candidateRunId?    : string;
  command            : string;
  actorUserId?       : string;
  generatedAt?       : Date;
  repository?        : ReviewRegressionSnapshotRepository;
  costSummaryService?: ReviewRegressionCostSummaryService;
}

/**
 * 统一计算报告产物路径。
 * 默认路径需要稳定可复现，便于 T20/T22 引用；显式传入 reportDir 时则尊重调用方指定目录。
 */
export function buildReviewRegressionReportPaths(input: {
  fixtureKey : string;
  generatedAt: Date;
  reportDir? : string;
}): ReviewRegressionReportPaths {
  const reportDir = input.reportDir ?? join(
    DEFAULT_REPORT_ROOT,
    `${input.fixtureKey}-${formatReportTimestamp(input.generatedAt)}`
  );

  return {
    reportDir,
    markdownPath: join(reportDir, "summary.md"),
    jsonPath    : join(reportDir, "summary.json")
  };
}

export function createReviewRegressionReport(
  input: CreateReviewRegressionReportInput
): ReviewRegressionReport {
  const paths = buildReviewRegressionReportPaths({
    fixtureKey : input.fixture.fixtureKey,
    generatedAt: input.generatedAt,
    reportDir  : input.reportDir
  });

  return reviewRegressionReportSchema.parse({
    command       : input.command,
    fixturePath   : input.fixturePath,
    fixture       : input.fixture,
    metrics       : input.metrics,
    missingKeys   : [...input.missingKeys],
    unexpectedKeys: [...input.unexpectedKeys],
    changedKeys   : [...input.changedKeys],
    actionResults : [...input.actionResults],
    runComparison : input.runComparison,
    generatedAtIso: input.generatedAt.toISOString(),
    markdownPath  : paths.markdownPath,
    jsonPath      : paths.jsonPath
  });
}

export function renderReviewRegressionReport(report: ReviewRegressionReport): string {
  const lines = [
    `# Review Regression Report: ${report.fixture.fixtureKey}`,
    "",
    `Generated at: ${report.generatedAtIso}`,
    `Command: \`${report.command}\``,
    "",
    "## Fixture",
    `- Fixture path: ${report.fixturePath}`,
    `- Book: ${report.fixture.bookTitle}`,
    `- Chapter range: ${report.fixture.chapterRange.startNo}-${report.fixture.chapterRange.endNo}`,
    "",
    "## Metrics",
    "| Metric | Matched/Passed | Missing/Failed | Changed/Unexpected | Percent |",
    "| --- | ---: | ---: | ---: | ---: |",
    renderMetricRow("Persona accuracy", {
      primary  : report.metrics.personaAccuracy.matched,
      secondary: report.metrics.personaAccuracy.missing,
      tertiary : report.metrics.personaAccuracy.unexpected,
      percent  : report.metrics.personaAccuracy.accuracyPct
    }),
    renderMetricRow("Relation stability", {
      primary  : report.metrics.relationStability.matched,
      secondary: report.metrics.relationStability.missing,
      tertiary : report.metrics.relationStability.changed,
      percent  : report.metrics.relationStability.stabilityPct
    }),
    renderMetricRow("Time usability", {
      primary  : report.metrics.timeNormalizationUsability.usable,
      secondary: report.metrics.timeNormalizationUsability.unusable,
      tertiary : 0,
      percent  : report.metrics.timeNormalizationUsability.usabilityPct
    }),
    renderMetricRow("Evidence traceability", {
      primary  : report.metrics.evidenceTraceability.traced,
      secondary: report.metrics.evidenceTraceability.untraced,
      tertiary : 0,
      percent  : report.metrics.evidenceTraceability.traceabilityPct
    }),
    renderMetricRow("Review action success", {
      primary  : report.metrics.reviewActionSuccessRate.passed,
      secondary: report.metrics.reviewActionSuccessRate.failed,
      tertiary : 0,
      percent  : report.metrics.reviewActionSuccessRate.successPct
    }),
    "",
    "## Mismatches",
    renderKeySection("Missing keys", report.missingKeys),
    "",
    renderKeySection("Unexpected keys", report.unexpectedKeys),
    "",
    renderKeySection("Changed keys", report.changedKeys),
    "",
    "## Review Actions",
    "| Scenario | Result | Audit action | Message |",
    "| --- | --- | --- | --- |",
    ...renderActionRows(report.actionResults),
    ""
  ];

  if (report.runComparison !== null) {
    lines.push(
      "## Run Comparison",
      `- Runs: ${report.runComparison.baselineRunId} -> ${report.runComparison.candidateRunId}`,
      `- Snapshot identical: ${report.runComparison.snapshotDiff.identical ? "yes" : "no"}`,
      renderKeySection("Added keys", report.runComparison.snapshotDiff.addedKeys),
      "",
      renderKeySection("Removed keys", report.runComparison.snapshotDiff.removedKeys),
      "",
      renderKeySection("Changed keys", report.runComparison.snapshotDiff.changedKeys),
      ""
    );

    if (report.runComparison.costComparison !== null) {
      lines.push(
        "## Cost Comparison",
        "```json",
        stringifyJsonWithBigInt(report.runComparison.costComparison),
        "```",
        ""
      );
    }
  }

  lines.push(
    "## Artifacts",
    `- Markdown: ${report.markdownPath}`,
    `- JSON: ${report.jsonPath}`
  );

  return lines.join("\n");
}

export async function writeReviewRegressionReport(
  report: ReviewRegressionReport
): Promise<WriteReviewRegressionReportResult> {
  const reportDir = report.markdownPath.slice(0, -"/summary.md".length);
  await mkdir(reportDir, { recursive: true });
  await writeFile(report.markdownPath, renderReviewRegressionReport(report), "utf8");
  await writeFile(report.jsonPath, `${stringifyJsonWithBigInt(report)}\n`, "utf8");

  return {
    markdownPath: report.markdownPath,
    jsonPath    : report.jsonPath
  };
}

/**
 * 供 CLI 复用的高层执行入口。
 * CLI 只负责参数解析和动态导入，这里集中串联 fixture、snapshot、metrics、action harness 与 report writer。
 */
export async function runReviewGoldSetRegression(
  input: RunReviewGoldSetRegressionInput
): Promise<ReviewRegressionReport> {
  const loadedFixture = await loadReviewRegressionFixture(input.fixturePath);
  const fixture = applyChapterOverride(loadedFixture, input.chapterStartNo, input.chapterEndNo);
  const repository = input.repository ?? createReviewRegressionSnapshotRepository();
  const generatedAt = input.generatedAt ?? new Date();
  const actorUserId = input.actorUserId ?? DEFAULT_ACTOR_USER_ID;
  const costService = input.costSummaryService ?? reviewRunCostSummaryService;

  const context = await repository.resolveFixtureContext(fixture);
  const currentRows = await repository.loadCurrentReviewRows(context);
  const currentSnapshot = buildCurrentReviewRegressionSnapshot(context, currentRows);
  const actionSummary = await runReviewRegressionActionScenarios({
    context,
    actorUserId
  });
  const evaluation = evaluateReviewRegressionFixture(fixture, currentSnapshot, actionSummary);
  const runComparison = await buildRunComparison({
    baselineRunId : input.baselineRunId,
    candidateRunId: input.candidateRunId,
    context,
    repository,
    costService
  });
  const report = createReviewRegressionReport({
    command       : input.command,
    fixturePath   : input.fixturePath,
    fixture,
    metrics       : evaluation.metrics,
    missingKeys   : evaluation.missingKeys,
    unexpectedKeys: evaluation.unexpectedKeys,
    changedKeys   : evaluation.changedKeys,
    actionResults : [...actionSummary.scenarioResults],
    runComparison,
    generatedAt,
    reportDir     : input.reportDir
  });

  await writeReviewRegressionReport(report);
  return report;
}

function renderMetricRow(
  label: string,
  input: { primary: number; secondary: number; tertiary: number; percent: number | null }
): string {
  return `| ${label} | ${input.primary} | ${input.secondary} | ${input.tertiary} | ${formatPercent(input.percent)} |`;
}

function renderKeySection(title: string, keys: readonly string[]): string {
  if (keys.length === 0) {
    return `### ${title}\n- None`;
  }

  return [
    `### ${title}`,
    ...keys.map((key) => `- ${key}`)
  ].join("\n");
}

function renderActionRows(actionResults: readonly ReviewRegressionActionResult[]): string[] {
  if (actionResults.length === 0) {
    return ["| _none_ | n/a | n/a | No review actions in fixture |"];
  }

  return actionResults.map((result) => [
    result.scenarioKey,
    result.passed ? "pass" : "fail",
    result.auditAction ?? "n/a",
    result.message
  ].map(escapeTableCell).join(" | ").replace(/^/, "| ").concat(" |"));
}

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}

function formatPercent(value: number | null): string {
  return value === null ? "n/a" : `${value}%`;
}

function formatReportTimestamp(value: Date): string {
  const year = value.getUTCFullYear();
  const month = padTwoDigits(value.getUTCMonth() + 1);
  const day = padTwoDigits(value.getUTCDate());
  const hour = padTwoDigits(value.getUTCHours());
  const minute = padTwoDigits(value.getUTCMinutes());
  const second = padTwoDigits(value.getUTCSeconds());

  return `${year}${month}${day}-${hour}${minute}${second}`;
}

function padTwoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

function stringifyJsonWithBigInt(value: unknown): string {
  return JSON.stringify(
    value,
    (_key, currentValue: unknown) => (
      typeof currentValue === "bigint" ? currentValue.toString() : currentValue
    ),
    2
  );
}

function applyChapterOverride(
  fixture: ReviewRegressionFixture,
  chapterStartNo: number | undefined,
  chapterEndNo: number | undefined
): ReviewRegressionFixture {
  const startNo = chapterStartNo ?? fixture.chapterRange.startNo;
  const endNo = chapterEndNo ?? fixture.chapterRange.endNo;

  if (endNo < startNo) {
    throw new Error("chapter override end must be greater than or equal to start");
  }

  if (startNo === fixture.chapterRange.startNo && endNo === fixture.chapterRange.endNo) {
    return fixture;
  }

  return {
    ...fixture,
    chapterRange: { startNo, endNo }
  };
}

async function buildRunComparison(input: {
  baselineRunId? : string;
  candidateRunId?: string;
  context        : Awaited<ReturnType<ReviewRegressionSnapshotRepository["resolveFixtureContext"]>>;
  repository     : ReviewRegressionSnapshotRepository;
  costService    : ReviewRegressionCostSummaryService;
}): Promise<ReviewRegressionRunComparison | null> {
  if (input.baselineRunId === undefined || input.candidateRunId === undefined) {
    return null;
  }

  const [baselineRows, candidateRows, baselineCostSummary, candidateCostSummary] = await Promise.all([
    input.repository.loadRunScopedClaimRows(input.context, input.baselineRunId),
    input.repository.loadRunScopedClaimRows(input.context, input.candidateRunId),
    input.costService.getSummary(input.baselineRunId),
    input.costService.getSummary(input.candidateRunId)
  ]);

  return compareReviewRegressionRuns({
    baselineRunId    : input.baselineRunId,
    candidateRunId   : input.candidateRunId,
    baselineSnapshot : buildRunScopedReviewRegressionSnapshot(input.context, baselineRows),
    candidateSnapshot: buildRunScopedReviewRegressionSnapshot(input.context, candidateRows),
    baselineCostSummary,
    candidateCostSummary
  });
}
