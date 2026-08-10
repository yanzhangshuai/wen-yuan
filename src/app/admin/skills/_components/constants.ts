/** 技能管理页共享常量（范围/状态选项与文案）。 */

export const SCOPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "GLOBAL", label: "全局" },
  { value: "BOOK_TYPE", label: "Agent 动态加载" }
];

export const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "ENABLED", label: "启用" },
  { value: "DISABLED", label: "停用" }
];

export function scopeLabel(value: string): string {
  return SCOPE_OPTIONS.find((option) => option.value === value)?.label ?? value;
}

export function statusLabel(value: string): string {
  return STATUS_OPTIONS.find((option) => option.value === value)?.label ?? value;
}
