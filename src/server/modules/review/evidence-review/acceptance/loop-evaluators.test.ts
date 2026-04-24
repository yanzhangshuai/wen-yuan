import { describe, expect, it } from "vitest";

import {
  evaluateEvidenceLoop,
  evaluateProjectionLoop,
  evaluateReviewLoop
} from "./loop-evaluators";

describe("evaluateEvidenceLoop", () => {
  it("fails when an accepted claim is missing evidence jump metadata", () => {
    const result = evaluateEvidenceLoop({
      claimDetails: [{
        claimKind  : "EVENT",
        claimId    : "event-1",
        reviewState: "ACCEPTED",
        evidence   : []
      }]
    } as never);

    expect(result.passed).toBe(false);
    expect(result.blocking).toBe(true);
  });
});

describe("evaluateReviewLoop", () => {
  it("fails when one required review action is missing", () => {
    const result = evaluateReviewLoop({
      auditActions: [
        "ACCEPT",
        "REJECT",
        "DEFER",
        "EDIT",
        "CREATE_MANUAL_CLAIM",
        "RELINK_EVIDENCE",
        "MERGE_PERSONA"
      ]
    } as never);

    expect(result.passed).toBe(false);
    expect(result.evidenceLines.join("\n")).toMatch(/SPLIT_PERSONA/);
  });
});

describe("evaluateProjectionLoop", () => {
  it("passes when before and after snapshots are equivalent", () => {
    const result = evaluateProjectionLoop({
      beforeSnapshotKeys: [
        "persona:范进",
        "relation:胡屠户->范进:father_in_law_of"
      ],
      afterSnapshotKeys: [
        "persona:范进",
        "relation:胡屠户->范进:father_in_law_of"
      ]
    });

    expect(result.passed).toBe(true);
  });
});
