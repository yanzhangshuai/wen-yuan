import { describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  runReviewGoldSetRegression: vi.fn(),
  disconnect                : vi.fn()
}));

vi.mock("../../src/server/modules/review/evidence-review/regression/index.ts", () => ({
  runReviewGoldSetRegression: hoisted.runReviewGoldSetRegression
}));

vi.mock("../../src/server/db/prisma.ts", () => ({
  prisma: {
    $disconnect: hoisted.disconnect
  }
}));

const {
  parseGoldSetRegressionArgs,
  runGoldSetRegression
} = await import("./run-gold-set-regression");

describe("run-gold-set-regression CLI", () => {
  it("parses supported options into a typed command contract", () => {
    expect(parseGoldSetRegressionArgs([
      "--fixture",
      "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      "--report-dir",
      "docs/superpowers/reports/review-regression/rulin-waishi-sample",
      "--chapter-start",
      "3",
      "--chapter-end",
      "4",
      "--baseline-run",
      "baseline-run-1",
      "--candidate-run",
      "candidate-run-1"
    ])).toEqual({
      fixturePath   : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      reportDir     : "docs/superpowers/reports/review-regression/rulin-waishi-sample",
      chapterStartNo: 3,
      chapterEndNo  : 4,
      baselineRunId : "baseline-run-1",
      candidateRunId: "candidate-run-1"
    });
  });

  it("returns null for help and throws stable usage errors for invalid arguments", () => {
    expect(parseGoldSetRegressionArgs(["--help"])).toBeNull();
    expect(() => parseGoldSetRegressionArgs([])).toThrow("Missing required option: --fixture");
    expect(() => parseGoldSetRegressionArgs(["--fixture", "fixture.json", "--unknown"]))
      .toThrow("Unknown option: --unknown");
    expect(() => parseGoldSetRegressionArgs([
      "--fixture",
      "fixture.json",
      "--baseline-run",
      "baseline-run-1"
    ])).toThrow("Both --baseline-run and --candidate-run are required for run comparison");
  });

  it("keeps the CLI thin by delegating execution to the regression package", async () => {
    hoisted.runReviewGoldSetRegression.mockResolvedValueOnce({
      markdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
      jsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
    });

    const exitCode = await runGoldSetRegression([
      "--fixture",
      "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      "--report-dir",
      "docs/superpowers/reports/review-regression/rulin-waishi-sample"
    ]);

    expect(exitCode).toBe(0);
    expect(hoisted.runReviewGoldSetRegression).toHaveBeenCalledWith({
      fixturePath   : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
      reportDir     : "docs/superpowers/reports/review-regression/rulin-waishi-sample",
      chapterStartNo: undefined,
      chapterEndNo  : undefined,
      baselineRunId : undefined,
      candidateRunId: undefined,
      command       : "pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json --report-dir docs/superpowers/reports/review-regression/rulin-waishi-sample"
    });
    expect(hoisted.disconnect).toHaveBeenCalledTimes(1);
  });
});
