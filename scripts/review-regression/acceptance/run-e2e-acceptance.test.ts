import { describe, expect, it, vi } from "vitest";

import {
  parseAcceptanceArgs,
  resolveAcceptanceRegressionReport
} from "./run-e2e-acceptance";

describe("parseAcceptanceArgs", () => {
  it("defaults to all books and allows skip-seed", () => {
    expect(parseAcceptanceArgs(["--skip-seed"])).toEqual({
      scenarioKey: "all",
      skipSeed   : true
    });
  });

  it("accepts a single named scenario", () => {
    expect(parseAcceptanceArgs(["--book", "rulin-waishi-sample"])).toEqual({
      scenarioKey: "rulin-waishi-sample",
      skipSeed   : false
    });
  });
});

describe("resolveAcceptanceRegressionReport", () => {
  it("reuses stable regression artifacts when run comparison is already present", async () => {
    const runRegression = vi.fn();
    const report = await resolveAcceptanceRegressionReport({
      scenario: {
        fixturePath: "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        referenceReports: {
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        }
      },
      pathExists: vi.fn().mockResolvedValue(true),
      readText  : vi.fn().mockResolvedValue(JSON.stringify({
        actionResults: [],
        runComparison: {
          snapshotDiff  : { identical: true },
          costComparison: { totalDeltaUsd: -0.02 }
        }
      })),
      parseReport: (rawText) => JSON.parse(rawText),
      runRegression
    });

    expect(report.runComparison?.snapshotDiff.identical).toBe(true);
    expect(runRegression).not.toHaveBeenCalled();
  });

  it("regenerates stable regression artifacts when run comparison is missing", async () => {
    const runRegression = vi.fn().mockResolvedValue({
      markdownPath : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
      jsonPath     : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
      actionResults: [],
      runComparison: {
        snapshotDiff  : { identical: true },
        costComparison: { totalDeltaUsd: -0.02 }
      }
    });

    await resolveAcceptanceRegressionReport({
      scenario: {
        fixturePath   : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        baselineRunId : "1a000000-0000-4000-8000-000000000001",
        candidateRunId: "1a000000-0000-4000-8000-000000000002",
        referenceReports: {
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        }
      },
      pathExists: vi.fn().mockResolvedValue(true),
      readText  : vi.fn().mockResolvedValue(JSON.stringify({
        actionResults: [],
        runComparison: null
      })),
      parseReport: (rawText) => JSON.parse(rawText),
      runRegression
    });

    expect(runRegression).toHaveBeenCalledWith({
      fixturePath   : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      reportDir     : "docs/superpowers/reports/review-regression/rulin-waishi-sample",
      baselineRunId : "1a000000-0000-4000-8000-000000000001",
      candidateRunId: "1a000000-0000-4000-8000-000000000002",
      command       : "pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample --baseline-run 1a000000-0000-4000-8000-000000000001 --candidate-run 1a000000-0000-4000-8000-000000000002"
    });
  });
});
