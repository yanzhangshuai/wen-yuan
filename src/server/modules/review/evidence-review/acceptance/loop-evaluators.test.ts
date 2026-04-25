import { describe, expect, it } from "vitest";

import {
  classifyFinalAcceptanceDecision,
  evaluateEvidenceLoop,
  evaluateKnowledgeLoop,
  evaluateProjectionLoop,
  evaluateRebuildLoop,
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

  it("uses scenario-declared expected actions when provided", () => {
    const result = evaluateReviewLoop({
      auditActions   : ["MERGE_PERSONA", "DEFER"],
      expectedActions: ["MERGE_PERSONA", "DEFER"]
    });

    expect(result.passed).toBe(true);
    expect(result.summary).toContain("expected");
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

describe("evaluateKnowledgeLoop", () => {
  it("fails when reviewed knowledge is absent or projection bypasses review", () => {
    const result = evaluateKnowledgeLoop({
      relationCatalogAvailable     : false,
      reviewedClaimBackedProjection: false
    });

    expect(result.passed).toBe(false);
    expect(result.blocking).toBe(true);
  });
});

describe("evaluateRebuildLoop", () => {
  it("passes when T21 rerun comparison is identical and has cost comparison", () => {
    const result = evaluateRebuildLoop({
      hasReferenceReport: true,
      rerunIdentical    : true,
      hasCostComparison : true
    });

    expect(result.passed).toBe(true);
  });
});

describe("classifyFinalAcceptanceDecision", () => {
  it("returns NO_GO when any blocking loop or manual check fails", () => {
    const result = classifyFinalAcceptanceDecision({
      loopResults: [
        {
          loopKey      : "EVIDENCE",
          passed       : true,
          blocking     : false,
          summary      : "",
          evidenceLines: [],
          artifactPaths: []
        },
        {
          loopKey      : "REVIEW",
          passed       : false,
          blocking     : true,
          summary      : "",
          evidenceLines: [],
          artifactPaths: []
        }
      ],
      manualChecks: [{
        checkKey           : "persona-chapter-evidence-jump",
        routePath          : "/admin/review/book-1",
        expectedObservation: "jump works",
        observed           : "not executed",
        passed             : false,
        blocking           : true
      }],
      risks: []
    });

    expect(result).toBe("NO_GO");
  });
});
