import { describe, expect, it } from "vitest";

import {
  ConflictSeverity,
  ConflictType
} from "@/generated/prisma/enums";
import {
  CONFLICT_RECOMMENDED_ACTION_KEYS,
  STAGE_B5_RULE_MODEL,
  STAGE_B5_RULE_PROVIDER,
  STAGE_B5_RULE_VERSION,
  STAGE_B5_STAGE_KEY,
  summarizeStageB5ConflictCounts
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

describe("stageB5/types", () => {
  it("exports stable stage metadata and action keys", () => {
    expect(STAGE_B5_STAGE_KEY).toBe("stage_b5_conflict_detection");
    expect(STAGE_B5_RULE_PROVIDER).toBe("rule-engine");
    expect(STAGE_B5_RULE_MODEL).toBe("stage-b5-conflict-detection-v1");
    expect(STAGE_B5_RULE_VERSION).toBe("2026-04-20-stage-b5-v1");
    expect(CONFLICT_RECOMMENDED_ACTION_KEYS).toEqual([
      "REQUEST_MORE_EVIDENCE",
      "VERIFY_IDENTITY_SPLIT",
      "VERIFY_LOCATION_ATTRIBUTION",
      "VERIFY_RELATION_DIRECTION",
      "VERIFY_TIME_ALIGNMENT"
    ]);
  });

  it("summarizes conflict counts by type and severity deterministically", () => {
    expect(summarizeStageB5ConflictCounts([
      { conflictType: ConflictType.POST_MORTEM_ACTION, severity: ConflictSeverity.CRITICAL },
      { conflictType: ConflictType.ALIAS_CONFLICT, severity: ConflictSeverity.HIGH },
      { conflictType: ConflictType.ALIAS_CONFLICT, severity: ConflictSeverity.HIGH },
      { conflictType: ConflictType.LOW_EVIDENCE_CLAIM, severity: ConflictSeverity.LOW }
    ])).toBe("ALIAS_CONFLICT:2,LOW_EVIDENCE_CLAIM:1,POST_MORTEM_ACTION:1 | CRITICAL:1,HIGH:2,LOW:1");
  });
});
