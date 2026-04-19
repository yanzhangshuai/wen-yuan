import { describe, expect, it } from "vitest";

import {
  getRuntimeReviewStates,
  knowledgeScopeSelectorSchema,
  runtimeVisibilityModeSchema
} from "@/server/modules/knowledge-v2/base-types";

describe("knowledge-v2 base types", () => {
  it("requires null scopeId for GLOBAL scope", () => {
    const parsed = knowledgeScopeSelectorSchema.safeParse({
      scopeType: "GLOBAL",
      scopeId  : "should-not-exist"
    });

    expect(parsed.success).toBe(false);
  });

  it("requires scopeId for BOOK scope", () => {
    const parsed = knowledgeScopeSelectorSchema.safeParse({
      scopeType: "BOOK",
      scopeId  : null
    });

    expect(parsed.success).toBe(false);
  });

  it("keeps runtime visibility modes explicit", () => {
    expect(runtimeVisibilityModeSchema.parse("VERIFIED_ONLY")).toBe("VERIFIED_ONLY");
    expect(getRuntimeReviewStates("VERIFIED_ONLY")).toEqual(["VERIFIED"]);
    expect(getRuntimeReviewStates("INCLUDE_PENDING")).toEqual(["VERIFIED", "PENDING"]);
  });
});
