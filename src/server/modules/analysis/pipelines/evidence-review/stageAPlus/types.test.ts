import { describe, expect, it } from "vitest";

import {
  STAGE_A_PLUS_CONFIDENCE,
  STAGE_A_PLUS_RULE_VERSION,
  STAGE_A_PLUS_STAGE_KEY,
  summarizeStageAPlusDiscards
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

describe("Stage A+ type contracts", () => {
  it("uses the canonical stage key and rule version", () => {
    expect(STAGE_A_PLUS_STAGE_KEY).toBe("stage_a_plus_knowledge_recall");
    expect(STAGE_A_PLUS_RULE_VERSION).toBe("2026-04-19-stage-a-plus-v1");
  });

  it("keeps pending knowledge weaker than verified knowledge", () => {
    expect(STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB).toBeGreaterThan(
      STAGE_A_PLUS_CONFIDENCE.PENDING_KB
    );
    expect(STAGE_A_PLUS_CONFIDENCE.NEGATIVE_KB).toBeGreaterThanOrEqual(
      STAGE_A_PLUS_CONFIDENCE.VERIFIED_KB
    );
  });

  it("summarizes discard codes deterministically", () => {
    expect(
      summarizeStageAPlusDiscards([
        { kind: "MENTION", ref: "m2", code: "QUOTE_NOT_FOUND", message: "missing" },
        { kind: "RELATION", ref: "r1", code: "SCHEMA_VALIDATION", message: "bad" },
        { kind: "MENTION", ref: "m1", code: "QUOTE_NOT_FOUND", message: "missing" }
      ])
    ).toBe("QUOTE_NOT_FOUND:2, SCHEMA_VALIDATION:1");
  });
});
