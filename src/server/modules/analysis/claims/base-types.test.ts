import { describe, expect, it } from "vitest";

import {
  assertReviewStateTransition,
  canTransitionReviewState,
  getNextReviewStates,
  isProjectionEligibleReviewState
} from "@/server/modules/review/evidence-review/review-state";

import {
  claimEnvelopeSchema,
  claimReviewStateSchema,
  claimSourceSchema,
  relationTypeSelectionSchema
} from "@/server/modules/analysis/claims/base-types";

const RUN_ID = "11111111-1111-4111-8111-111111111111";
const EVIDENCE_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";

describe("claim base type schemas", () => {
  it("accepts an evidence-bound ai claim envelope", () => {
    const parsed = claimEnvelopeSchema.parse({
      source            : "AI",
      reviewState       : "PENDING",
      runId             : RUN_ID,
      evidenceSpanIds   : [EVIDENCE_ID],
      supersedesClaimId : null,
      derivedFromClaimId: null,
      createdByUserId   : null,
      reviewedByUserId  : USER_ID,
      reviewNote        : "初始待审"
    });

    expect(parsed.source).toBe("AI");
    expect(parsed.reviewState).toBe("PENDING");
  });

  it("rejects envelopes without evidence spans", () => {
    expect(() => claimEnvelopeSchema.parse({
      source            : "RULE",
      reviewState       : "PENDING",
      runId             : RUN_ID,
      evidenceSpanIds   : [],
      supersedesClaimId : null,
      derivedFromClaimId: null,
      createdByUserId   : null,
      reviewedByUserId  : null,
      reviewNote        : null
    })).toThrowError(/at least 1/i);
  });

  it("keeps relationTypeKey as a free string key instead of an enum", () => {
    const parsed = relationTypeSelectionSchema.parse({
      relationTypeKey   : "political_patron_of",
      relationLabel     : "政治庇护",
      relationTypeSource: "CUSTOM",
      direction         : "FORWARD"
    });

    expect(parsed.relationTypeKey).toBe("political_patron_of");
    expect(() => relationTypeSelectionSchema.parse({
      relationTypeKey   : 42,
      relationLabel     : "政治庇护",
      relationTypeSource: "CUSTOM",
      direction         : "FORWARD"
    })).toThrowError();
  });

  it("reuses the shared source and review-state schemas", () => {
    expect(claimSourceSchema.parse("MANUAL")).toBe("MANUAL");
    expect(claimReviewStateSchema.parse("CONFLICTED")).toBe("CONFLICTED");
  });
});

describe("review-state helpers coverage guard", () => {
  it("validates transitions and projection eligibility", () => {
    expect(getNextReviewStates("PENDING")).toContain("ACCEPTED");
    expect(canTransitionReviewState("PENDING", "ACCEPTED")).toBe(true);
    expect(canTransitionReviewState("REJECTED", "ACCEPTED")).toBe(false);
    expect(() => assertReviewStateTransition("PENDING", "ACCEPTED")).not.toThrowError();
    expect(() => assertReviewStateTransition("REJECTED", "ACCEPTED")).toThrowError();
    expect(isProjectionEligibleReviewState("ACCEPTED")).toBe(true);
    expect(isProjectionEligibleReviewState("DEFERRED")).toBe(false);
  });
});
