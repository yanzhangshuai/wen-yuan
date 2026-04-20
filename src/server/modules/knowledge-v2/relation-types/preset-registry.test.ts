import { describe, expect, it } from "vitest";

import { RELATION_TYPE_PRESETS } from "@/server/modules/knowledge-v2/relation-types/preset-registry";

describe("relation-type preset registry", () => {
  it("ships stable preset keys without duplicates", () => {
    expect(RELATION_TYPE_PRESETS.map((item) => item.relationTypeKey)).toEqual([
      "teacher_of",
      "parent_of",
      "spouse_of",
      "sworn_brother",
      "ruler_of",
      "subordinate_of"
    ]);
  });

  it("does not duplicate alias labels across presets", () => {
    const aliases = RELATION_TYPE_PRESETS.flatMap((item) => item.aliasLabels);
    expect(new Set(aliases).size).toBe(aliases.length);
  });
});
