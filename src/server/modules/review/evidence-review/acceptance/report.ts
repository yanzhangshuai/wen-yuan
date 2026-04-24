import type { z } from "zod";

import {
  acceptanceBookReportSchema,
  finalAcceptanceReportSchema
} from "./contracts";

type AcceptanceBookReportInput = z.input<typeof acceptanceBookReportSchema>;
type AcceptanceBookReport = z.infer<typeof acceptanceBookReportSchema>;
type FinalAcceptanceReportInput = z.input<typeof finalAcceptanceReportSchema>;
type AcceptanceRiskItem = AcceptanceBookReport["risks"][number];

function renderRiskLine(risk: AcceptanceRiskItem): string {
  return `- [${risk.severity}] ${risk.summary} | owner=${risk.owner} | mitigation=${risk.mitigation}`;
}

/**
 * 单书验收报告需要保持稳定段落顺序，便于人工 review 和后续 runbook 引用。
 */
export function renderAcceptanceBookReport(input: AcceptanceBookReportInput): string {
  const report = acceptanceBookReportSchema.parse(input);
  const lines = [
    `# Acceptance Report: ${report.bookTitle}`,
    "",
    `Scenario: ${report.scenarioKey}`,
    `Decision: ${report.decision}`,
    `Generated at: ${report.generatedAtIso}`,
    "",
    "## Referenced Artifacts",
    `- T20 task: ${report.referencedArtifacts.t20TaskPath}`,
    `- T21 markdown: ${report.referencedArtifacts.t21MarkdownPath}`,
    `- T21 json: ${report.referencedArtifacts.t21JsonPath}`,
    "",
    "## Loop Results"
  ];

  if (report.loopResults.length === 0) {
    lines.push("- none", "");
  } else {
    for (const loop of report.loopResults) {
      lines.push(
        `### ${loop.loopKey}`,
        `- Passed: ${loop.passed ? "yes" : "no"}`,
        `- Blocking: ${loop.blocking ? "yes" : "no"}`,
        `- Summary: ${loop.summary}`
      );

      if (loop.evidenceLines.length === 0) {
        lines.push("- Evidence: none");
      } else {
        lines.push(...loop.evidenceLines.map((line) => `- Evidence: ${line}`));
      }

      if (loop.artifactPaths.length === 0) {
        lines.push("- Artifact: none");
      } else {
        lines.push(...loop.artifactPaths.map((line) => `- Artifact: ${line}`));
      }

      lines.push("");
    }
  }

  lines.push("## Manual Checks");
  if (report.manualChecks.length === 0) {
    lines.push("- none");
  } else {
    for (const check of report.manualChecks) {
      lines.push(
        `- ${check.checkKey}: ${check.routePath}`,
        `  expected=${check.expectedObservation}`,
        `  observed=${check.observed}`,
        `  passed=${check.passed ? "yes" : "no"}`,
        `  blocking=${check.blocking ? "yes" : "no"}`
      );
    }
  }

  lines.push("", "## Risks");
  if (report.risks.length === 0) {
    lines.push("- none");
  } else {
    lines.push(...report.risks.map(renderRiskLine));
  }

  return lines.join("\n");
}

/**
 * 最终 go/no-go 报告是单书报告的聚合视图，重点保持结论、风险和样本书决策的稳定可引用性。
 */
export function renderFinalAcceptanceReport(input: FinalAcceptanceReportInput): string {
  const report = finalAcceptanceReportSchema.parse(input);

  return [
    "# Evidence-First Rewrite Final Go/No-Go",
    "",
    `Decision: ${report.overallDecision}`,
    `Generated at: ${report.generatedAtIso}`,
    "",
    "## Books",
    ...(report.bookReports.length === 0
      ? ["- none"]
      : report.bookReports.map((item) => `- ${item.scenarioKey}: ${item.decision}`)),
    "",
    "## Summary",
    ...(report.summaryLines.length === 0
      ? ["- none"]
      : report.summaryLines.map((item) => `- ${item}`)),
    "",
    "## Blocking Risks",
    ...(report.blockingRisks.length === 0
      ? ["- none"]
      : report.blockingRisks.map(renderRiskLine)),
    "",
    "## Non-Blocking Risks",
    ...(report.nonBlockingRisks.length === 0
      ? ["- none"]
      : report.nonBlockingRisks.map(renderRiskLine))
  ].join("\n");
}
