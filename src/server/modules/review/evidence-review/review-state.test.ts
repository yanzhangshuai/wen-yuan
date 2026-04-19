import { describe, expect, it } from "vitest";

import {
  CLAIM_REVIEW_STATE_VALUES,
  CLAIM_SOURCE_VALUES,
  RELATION_DIRECTION_VALUES,
  RELATION_TYPE_SOURCE_VALUES,
  assertReviewStateTransition,
  canTransitionReviewState,
  getNextReviewStates,
  isProjectionEligibleReviewState
} from "@/server/modules/review/evidence-review/review-state";

describe("evidence review state helpers", () => {
  it("allows pending and conflicted claims to move into reviewer outcomes", () => {
    expect(getNextReviewStates("PENDING")).toEqual([
      "ACCEPTED",
      "REJECTED",
      "EDITED",
      "DEFERRED",
      "CONFLICTED"
    ]);
    expect(canTransitionReviewState("CONFLICTED", "REJECTED")).toBe(true);
    expect(() => assertReviewStateTransition("PENDING", "ACCEPTED")).not.toThrowError();
  });

  it("rejects illegal back transitions", () => {
    expect(canTransitionReviewState("REJECTED", "PENDING")).toBe(false);
    expect(() => assertReviewStateTransition("ACCEPTED", "PENDING")).toThrowError(
      "Claim review state cannot transition from ACCEPTED to PENDING"
    );
  });

  it("marks only accepted claims as projection eligible", () => {
    expect(isProjectionEligibleReviewState("ACCEPTED")).toBe(true);
    expect(isProjectionEligibleReviewState("PENDING")).toBe(false);
    expect(isProjectionEligibleReviewState("EDITED")).toBe(false);
  });

  it("exports the runtime value sets reused by schema and DTO code", () => {
    expect(CLAIM_REVIEW_STATE_VALUES).toEqual([
      "PENDING",
      "ACCEPTED",
      "REJECTED",
      "EDITED",
      "DEFERRED",
      "CONFLICTED"
    ]);
    expect(CLAIM_SOURCE_VALUES).toEqual(["AI", "RULE", "MANUAL", "IMPORTED"]);
    expect(RELATION_DIRECTION_VALUES).toEqual([
      "FORWARD",
      "REVERSE",
      "BIDIRECTIONAL",
      "UNDIRECTED"
    ]);
    expect(RELATION_TYPE_SOURCE_VALUES).toEqual([
      "PRESET",
      "CUSTOM",
      "NORMALIZED_FROM_CUSTOM"
    ]);
  });

  it("freezes exported values and transition arrays at runtime", () => {
    const pendingNextStates = getNextReviewStates("PENDING");

    expect(Object.isFrozen(CLAIM_REVIEW_STATE_VALUES)).toBe(true);
    expect(Object.isFrozen(CLAIM_SOURCE_VALUES)).toBe(true);
    expect(Object.isFrozen(RELATION_DIRECTION_VALUES)).toBe(true);
    expect(Object.isFrozen(RELATION_TYPE_SOURCE_VALUES)).toBe(true);
    expect(Object.isFrozen(pendingNextStates)).toBe(true);

    expect(() => {
      Object.defineProperty(CLAIM_REVIEW_STATE_VALUES, "0", { value: "HACKED" });
    }).toThrowError(TypeError);
    expect(() => {
      Object.defineProperty(pendingNextStates, "0", { value: "PENDING" });
    }).toThrowError(TypeError);
    expect(getNextReviewStates("PENDING")[0]).toBe("ACCEPTED");
  });
});
