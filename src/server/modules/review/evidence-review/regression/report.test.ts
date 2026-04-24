import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type {
  ReviewRegressionFixture,
  ReviewRegressionMetricSummary,
  ReviewRegressionRunComparison
} from "./contracts";
import {
  buildReviewRegressionReportPaths,
  createReviewRegressionReport,
  renderReviewRegressionReport,
  writeReviewRegressionReport
} from "./report";

const GENERATED_AT = new Date("2026-04-23T08:09:10.000Z");

const fixture: ReviewRegressionFixture = {
  fixtureKey   : "rulin-waishi",
  bookTitle    : "儒林外史",
  chapterRange : { startNo: 3, endNo: 4 },
  personas     : [],
  chapterFacts : [],
  relations    : [],
  timeFacts    : [],
  reviewActions: [],
  rerunSamples : []
};

const metrics: ReviewRegressionMetricSummary = {
  personaAccuracy: {
    matched    : 2,
    missing    : 1,
    unexpected : 0,
    accuracyPct: 66.7
  },
  relationStability: {
    matched     : 1,
    missing     : 0,
    changed     : 1,
    stabilityPct: 50
  },
  timeNormalizationUsability: {
    usable      : 1,
    unusable    : 1,
    usabilityPct: 50
  },
  evidenceTraceability: {
    traced         : 3,
    untraced       : 1,
    traceabilityPct: 75
  },
  reviewActionSuccessRate: {
    passed    : 7,
    failed    : 1,
    successPct: 87.5
  }
};

const runComparison: ReviewRegressionRunComparison = {
  baselineRunId : "baseline-run-1",
  candidateRunId: "candidate-run-1",
  snapshotDiff  : {
    identical  : false,
    addedKeys  : ["relations:诸葛亮\u001f刘备\u001fally"],
    removedKeys: ["timeFacts:范进\u001f后来\u001f3\u001f4"],
    changedKeys: ["relations:范进\u001f周进\u001fmentor.custom"]
  },
  costComparison: {
    delta: {
      totalTokens        : -1200,
      estimatedCostMicros: BigInt(-2300)
    },
    savings: {
      totalTokenSavingsPct: 42.5,
      costSavingsPct      : 39.1
    }
  }
};

const cleanupDirs: string[] = [];

afterEach(async () => {
  await Promise.all(cleanupDirs.map((dir) => rm(dir, { force: true, recursive: true })));
  cleanupDirs.length = 0;
});

describe("review regression report", () => {
  it("computes deterministic artifact paths under the default report root", () => {
    const paths = buildReviewRegressionReportPaths({
      fixtureKey : "rulin-waishi",
      generatedAt: GENERATED_AT
    });

    expect(paths).toEqual({
      reportDir   : "docs/superpowers/reports/review-regression/rulin-waishi-20260423-080910",
      markdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-20260423-080910/summary.md",
      jsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-20260423-080910/summary.json"
    });
  });

  it("renders markdown with stable report sections and optional run and cost comparisons", () => {
    const report = createReviewRegressionReport({
      command       : "pnpm exec ts-node --esm scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json",
      fixturePath   : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      fixture,
      metrics,
      missingKeys   : ["personas:严监生"],
      unexpectedKeys: ["chapterFacts:范进\u001f3\u001f误认"],
      changedKeys   : ["relations:范进\u001f周进\u001fmentor.custom"],
      actionResults : [{
        scenarioKey: "accept-fan-jin-event",
        passed     : true,
        message    : "passed",
        auditAction: "ACCEPT"
      }],
      runComparison,
      generatedAt: GENERATED_AT
    });

    const markdown = renderReviewRegressionReport(report);
    const sectionOrder = [
      "## Fixture",
      "## Metrics",
      "## Mismatches",
      "## Review Actions",
      "## Run Comparison",
      "## Cost Comparison",
      "## Artifacts"
    ].map((heading) => markdown.indexOf(heading));

    expect(markdown).toContain("# Review Regression Report: rulin-waishi");
    expect(markdown).toContain("| Persona accuracy | 2 | 1 | 0 | 66.7% |");
    expect(markdown).toContain("personas:严监生");
    expect(markdown).toContain("| accept-fan-jin-event | pass | ACCEPT | passed |");
    expect(markdown).toContain("baseline-run-1 -> candidate-run-1");
    expect(markdown).toContain("estimatedCostMicros");
    expect(sectionOrder).toEqual([...sectionOrder].sort((left, right) => left - right));
  });

  it("writes matching markdown and JSON summaries with bigint-safe serialization", async () => {
    const reportDir = await mkdtemp(join(tmpdir(), "review-regression-report-"));
    cleanupDirs.push(reportDir);

    const report = createReviewRegressionReport({
      command       : "pnpm review-regression",
      fixturePath   : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      fixture,
      metrics,
      missingKeys   : [],
      unexpectedKeys: [],
      changedKeys   : [],
      actionResults : [],
      runComparison,
      generatedAt   : GENERATED_AT,
      reportDir
    });

    const written = await writeReviewRegressionReport(report);

    expect(written).toEqual({
      markdownPath: join(reportDir, "summary.md"),
      jsonPath    : join(reportDir, "summary.json")
    });
    await expect(readFile(join(reportDir, "summary.md"), "utf8")).resolves.toContain("Review Regression Report");
    await expect(readFile(join(reportDir, "summary.json"), "utf8")).resolves.toContain("\"estimatedCostMicros\": \"-2300\"");
  });
});
