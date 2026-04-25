import { describe, expect, it } from "vitest";

import {
  ACCEPTANCE_SCENARIOS,
  FINAL_ACCEPTANCE_REPORT_PATHS
} from "./scenarios";

describe("acceptance scenarios", () => {
  it("registers both sample books with stable report paths", () => {
    expect(ACCEPTANCE_SCENARIOS.map((item) => item.scenarioKey)).toEqual([
      "rulin-waishi-sample",
      "sanguo-yanyi-sample"
    ]);
    expect(ACCEPTANCE_SCENARIOS[0]).toMatchObject({
      sampleBookId  : "10000000-0000-4000-8000-000000000001",
      baselineRunId : "1a000000-0000-4000-8000-000000000001",
      candidateRunId: "1a000000-0000-4000-8000-000000000002"
    });
    expect(ACCEPTANCE_SCENARIOS[0].reportPaths.markdownPath)
      .toBe("docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md");
    expect(ACCEPTANCE_SCENARIOS[1].referenceReports.t21JsonPath)
      .toBe("docs/superpowers/reports/review-regression/sanguo-yanyi-sample/summary.json");
  });

  it("locks the final aggregate report paths", () => {
    expect(FINAL_ACCEPTANCE_REPORT_PATHS).toEqual({
      markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
      jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
    });
  });
});
