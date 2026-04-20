import { describe, expect, it } from "vitest";

import {
  STAGE_B_RULE_MODEL,
  STAGE_B_RULE_PROVIDER,
  STAGE_B_RULE_VERSION,
  STAGE_B_STAGE_KEY,
  summarizeStageBDecisionCounts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

describe("Stage B type contracts", () => {
  it("exports stable stage metadata", () => {
    expect(STAGE_B_STAGE_KEY).toBe("stage_b_identity_resolution");
    expect(STAGE_B_RULE_PROVIDER).toBe("rule-engine");
    expect(STAGE_B_RULE_MODEL).toBe("stage-b-identity-resolution-v1");
    expect(STAGE_B_RULE_VERSION).toBe("2026-04-20-stage-b-v1");
  });

  it("summarizes resolution kinds and review states deterministically", () => {
    expect(
      summarizeStageBDecisionCounts([
        { resolutionKind: "RESOLVES_TO", reviewState: "PENDING" },
        { resolutionKind: "RESOLVES_TO", reviewState: "PENDING" },
        { resolutionKind: "MERGE_INTO", reviewState: "PENDING" },
        { resolutionKind: "UNSURE", reviewState: "CONFLICTED" }
      ])
    ).toBe("MERGE_INTO:1,RESOLVES_TO:2,UNSURE:1 | CONFLICTED:1,PENDING:3");
  });
});
