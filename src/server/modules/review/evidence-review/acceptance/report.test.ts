import { describe, expect, it } from "vitest";

import {
  renderAcceptanceBookReport,
  renderFinalAcceptanceReport
} from "./report";

describe("renderAcceptanceBookReport", () => {
  it("renders loop sections, manual checklist, risks, and references", () => {
    const markdown = renderAcceptanceBookReport({
      scenarioKey        : "rulin-waishi-sample",
      bookId             : "book-1",
      bookTitle          : "儒林外史",
      generatedAtIso     : "2026-04-24T00:00:00.000Z",
      referencedArtifacts: {
        t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
        t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
      },
      loopResults: [{
        loopKey      : "EVIDENCE",
        passed       : true,
        blocking     : false,
        summary      : "ok",
        evidenceLines: ["EVENT:event-1 has evidence"],
        artifactPaths: []
      }],
      manualChecks: [{
        checkKey           : "persona-chapter-evidence-jump",
        routePath          : "/admin/review/book-1",
        expectedObservation: "jump works",
        observed           : "confirmed",
        passed             : true,
        blocking           : true
      }],
      risks   : [],
      decision: "GO"
    });

    expect(markdown).toContain("## Loop Results");
    expect(markdown).toContain("## Manual Checks");
    expect(markdown).toContain("/admin/review/book-1");
  });
});

describe("renderFinalAcceptanceReport", () => {
  it("renders stable sections and per-book decisions", () => {
    const markdown = renderFinalAcceptanceReport({
      generatedAtIso : "2026-04-24T00:00:00.000Z",
      overallDecision: "NO_GO",
      bookReports    : [{
        scenarioKey        : "rulin-waishi-sample",
        bookId             : "book-1",
        bookTitle          : "儒林外史",
        generatedAtIso     : "2026-04-24T00:00:00.000Z",
        referencedArtifacts: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        loopResults : [],
        manualChecks: [],
        risks       : [],
        decision    : "NO_GO"
      }],
      blockingRisks: [{
        severity  : "BLOCKING",
        summary   : "manual check pending",
        owner     : "reviewer",
        mitigation: "record manual observation"
      }],
      nonBlockingRisks: [],
      summaryLines    : ["rulin-waishi-sample: NO_GO"]
    });

    expect(markdown).toContain("# Evidence-First Rewrite Final Go/No-Go");
    expect(markdown).toContain("## Books");
    expect(markdown).toContain("rulin-waishi-sample: NO_GO");
  });
});
