import { describe, expect, it } from "vitest";

import {
  THEME_IDS,
  THEME_OPTIONS,
  THEME_TOKENS,
  getEdgeTypeColorsForTheme,
  getFactionColorsForTheme
} from "@/theme";

describe("theme barrel exports", () => {
  it("keeps theme ids, options and tokens aligned", () => {
    expect(THEME_OPTIONS.map((option) => option.value)).toEqual([...THEME_IDS]);

    for (const themeId of THEME_IDS) {
      expect(THEME_TOKENS[themeId].id).toBe(themeId);
      expect(THEME_TOKENS[themeId].label.length).toBeGreaterThan(0);
    }
  });

  it("returns the configured colors for a valid theme", () => {
    expect(getFactionColorsForTheme("danqing")).toEqual(THEME_TOKENS.danqing.factionColors);
    expect(getEdgeTypeColorsForTheme("danqing")).toEqual(THEME_TOKENS.danqing.edgeTypeColors);
  });

  it("falls back to the suya theme for missing or invalid ids", () => {
    expect(getFactionColorsForTheme(undefined)).toEqual(THEME_TOKENS.suya.factionColors);
    expect(getFactionColorsForTheme("unknown-theme")).toEqual(THEME_TOKENS.suya.factionColors);
    expect(getEdgeTypeColorsForTheme(undefined)).toEqual(THEME_TOKENS.suya.edgeTypeColors);
    expect(getEdgeTypeColorsForTheme("unknown-theme")).toEqual(THEME_TOKENS.suya.edgeTypeColors);
  });
});
