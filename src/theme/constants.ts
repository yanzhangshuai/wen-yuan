/**
 * 主题常量 — ID、显示标签
 * 派系配色已移至 tokens/ 目录，由各主题文件独立管理
 */

export const THEME_IDS = ["danqing", "suya", "diancang", "xingkong"] as const;
export type ThemeId = (typeof THEME_IDS)[number];

export const THEME_OPTIONS = [
  { value: "danqing",  label: "丹青" },
  { value: "suya",     label: "素雅" },
  { value: "diancang", label: "典藏" },
  { value: "xingkong", label: "星空" }
] as const;
