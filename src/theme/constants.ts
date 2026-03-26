/**
 * 主题常量 — 所有主题 ID、显示标签、派系配色统一管理
 */

export const THEME_IDS = ["theme-01", "theme-02", "theme-03", "theme-04"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_OPTIONS = [
  { value: "theme-01", label: "古风" },
  { value: "theme-02", label: "简约" },
  { value: "theme-03", label: "典藏" },
  { value: "theme-04", label: "星空" }
] as const;

// Faction colors per theme (indices 0-5 for default book cover)
export const FACTION_COLORS: Record<ThemeId, readonly string[]> = {
  "theme-01": [
    "#D95445", // 朱砂红
    "#5A8DB8", // 青花蓝
    "#4A9E5C", // 松绿
    "#D4A050", // 琥珀金
    "#9B6AB0", // 紫棠
    "#CA7A3E"  // 赭石橙
  ],
  "theme-02": [
    "#3B82F6", // Blue
    "#10B981", // Emerald
    "#F59E0B", // Amber
    "#EF4444", // Red
    "#8B5CF6", // Violet
    "#EC4899"  // Pink
  ],
  "theme-03": [
    "#C8A86E", // 黄铜金
    "#7AACCB", // 月石蓝
    "#5A9E6F", // 青瓷绿
    "#D4A855", // 琉璃金
    "#9B7DB8", // 紫水晶
    "#C9805A"  // 红陶橙
  ],
  "theme-04": [
    "#7B90AF", // 星辉银蓝
    "#5AACB4", // 暗青
    "#6A9E7A", // 暗绿
    "#B08A5A", // 暗金
    "#9080A0", // 暗紫
    "#A88070"  // 暗橙
  ]
};

export function getFactionColorsForTheme(theme: string | undefined): readonly string[] {
  if (theme && theme in FACTION_COLORS) {
    return FACTION_COLORS[theme as ThemeId];
  }
  return FACTION_COLORS["theme-02"];
}
