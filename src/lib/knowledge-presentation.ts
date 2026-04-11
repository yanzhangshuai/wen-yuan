export const KNOWLEDGE_PACK_SCOPE_OPTIONS = [
  {
    value      : "GENRE",
    label      : "题材通用",
    description: "供同题材书籍共享使用"
  },
  {
    value      : "BOOK",
    label      : "书籍专用",
    description: "仅服务当前书籍"
  }
] as const;

export const KNOWLEDGE_ENTRY_TYPE_OPTIONS = [
  {
    value: "CHARACTER",
    label: "人物"
  },
  {
    value: "LOCATION",
    label: "地点"
  },
  {
    value: "ORGANIZATION",
    label: "组织"
  }
] as const;

export const GENERIC_TITLE_TIER_OPTIONS = [
  {
    value      : "SAFETY",
    label      : "安全泛称",
    description: "任何情况下都不应指向具体人物"
  },
  {
    value      : "DEFAULT",
    label      : "默认泛称",
    description: "默认按泛称处理，可按题材豁免"
  }
] as const;

export function getKnowledgePackScopeLabel(scope: string): string {
  return KNOWLEDGE_PACK_SCOPE_OPTIONS.find((item) => item.value === scope)?.label ?? scope;
}

export function getKnowledgePackScopeDescription(scope: string): string {
  return KNOWLEDGE_PACK_SCOPE_OPTIONS.find((item) => item.value === scope)?.description ?? scope;
}

export function getKnowledgeEntryTypeLabel(entryType: string): string {
  return KNOWLEDGE_ENTRY_TYPE_OPTIONS.find((item) => item.value === entryType)?.label ?? entryType;
}

export function getGenericTitleTierLabel(tier: string): string {
  return GENERIC_TITLE_TIER_OPTIONS.find((item) => item.value === tier)?.label ?? tier;
}

export function getGenericTitleTierDescription(tier: string): string {
  return GENERIC_TITLE_TIER_OPTIONS.find((item) => item.value === tier)?.description ?? tier;
}
