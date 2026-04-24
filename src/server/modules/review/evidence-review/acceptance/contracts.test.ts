import { describe, expect, it } from "vitest";

import {
  ACCEPTANCE_LOOP_KEYS,
  acceptanceBookReportSchema,
  acceptanceManualObservationFileSchema,
  acceptanceRiskItemSchema,
  finalAcceptanceReportSchema
} from "./contracts";

describe("acceptance contracts", () => {
  it("locks the five required loops", () => {
    expect(ACCEPTANCE_LOOP_KEYS).toEqual([
      "EVIDENCE",
      "REVIEW",
      "PROJECTION",
      "KNOWLEDGE",
      "REBUILD"
    ]);
  });

  it("rejects blocking risks without owner and mitigation", () => {
    expect(() => {
      acceptanceRiskItemSchema.parse({
        severity  : "BLOCKING",
        summary   : "review loop missing SPLIT",
        owner     : "",
        mitigation: ""
      });
    }).toThrowError(/owner/i);
  });

  it("accepts final report with per-book decisions", () => {
    const parsed = finalAcceptanceReportSchema.parse({
      generatedAtIso : "2026-04-24T00:00:00.000Z",
      overallDecision: "GO",
      bookReports    : [{
        scenarioKey       : "rulin-waishi-sample",
        bookId            : "book-1",
        bookTitle         : "儒林外史",
        generatedAtIso    : "2026-04-24T00:00:00.000Z",
        referencedArtifacts: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        loopResults: [],
        manualChecks: [],
        risks      : [],
        decision   : "GO"
      }],
      blockingRisks   : [],
      nonBlockingRisks: [],
      summaryLines    : ["All loops passed."]
    });

    const report = acceptanceBookReportSchema.parse(parsed.bookReports[0]);

    expect(parsed.overallDecision).toBe("GO");
    expect(report.bookTitle).toBe("儒林外史");
  });

  it("accepts stable manual observation files", () => {
    const parsed = acceptanceManualObservationFileSchema.parse({
      scenarioKey: "rulin-waishi-sample",
      checks     : [{
        checkKey      : "persona-chapter-evidence-jump",
        observed      : "Claim detail panel opened and jumped to chapter evidence.",
        passed        : true,
        observedAtIso : "2026-04-24T00:00:00.000Z"
      }]
    });

    expect(parsed.checks).toHaveLength(1);
  });
});
