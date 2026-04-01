import { describe, expect, it } from "vitest";

import {
  DEFAULT_POSITION_STEMS,
  UNIVERSAL_TITLE_STEMS,
  buildEffectiveGenericTitles,
  buildEffectiveTitlePattern
} from "@/server/modules/analysis/config/lexicon";

describe("lexicon config helpers", () => {
  it("buildEffectiveGenericTitles applies additional and exempt entries", () => {
    const effective = buildEffectiveGenericTitles({
      additionalGenericTitles: ["掌门", "山主"],
      exemptGenericTitles    : ["先生", "公子"]
    }, false);

    expect(effective.has("掌门")).toBe(true);
    expect(effective.has("山主")).toBe(true);
    expect(effective.has("先生")).toBe(false);
    expect(effective.has("公子")).toBe(false);
  });

  it("buildEffectiveTitlePattern merges universal/default/book stems and avoids single-char fallback", () => {
    const pattern = buildEffectiveTitlePattern({
      additionalTitlePatterns   : ["盟主"],
      additionalPositionPatterns: ["节度使"]
    });

    expect(UNIVERSAL_TITLE_STEMS.length).toBeGreaterThan(0);
    expect(DEFAULT_POSITION_STEMS.length).toBeGreaterThan(0);
    expect(pattern.test("武林盟主")).toBe(true);
    expect(pattern.test("河东节度使")).toBe(true);
    expect(pattern.test("王")).toBe(false);
    expect(pattern.test("侯")).toBe(false);
    expect(pattern.test("伯")).toBe(false);
  });
});
