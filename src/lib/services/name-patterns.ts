import { clientFetch, clientMutate } from "@/lib/client-api";

export type NamePatternRuleType =
  | "FAMILY_HOUSE"
  | "DESCRIPTIVE_PHRASE"
  | "RELATIONAL_COMPOUND";

export type NamePatternAction = "BLOCK" | "WARN";

export interface NamePatternRuleItem {
  id          : string;
  ruleType    : NamePatternRuleType;
  pattern     : string;
  action      : NamePatternAction;
  description : string | null;
  source      : string;
  reviewStatus: string;
  reviewNote  : string | null;
  isActive    : boolean;
  createdAt   : string;
  updatedAt   : string;
}

export interface NamePatternListResult {
  data      : NamePatternRuleItem[];
  pagination: {
    page    : number;
    pageSize: number;
    total   : number;
  };
}

export interface NamePatternTestResult {
  name        : string;
  matched     : boolean;
  matchedRules: Array<{
    id      : string;
    ruleType: string;
    pattern : string;
    action  : string;
  }>;
  finalAction: "BLOCK" | "WARN" | "PASS";
}

export const NAME_PATTERN_RULE_TYPES: Array<{ value: NamePatternRuleType; label: string; description: string }> = [
  {
    value      : "FAMILY_HOUSE",
    label      : "家族/府邸后缀",
    description: "匹配 X家 X府 等家族称谓模式，阻止其被识别为人名"
  },
  {
    value      : "DESCRIPTIVE_PHRASE",
    label      : "描述性短语",
    description: "匹配描述性词组，如某某之类"
  },
  {
    value      : "RELATIONAL_COMPOUND",
    label      : "关系复合词",
    description: "匹配包含关系词的复合称谓，如老某、小某"
  }
];

export const NAME_PATTERN_ACTIONS: Array<{ value: NamePatternAction; label: string }> = [
  { value: "BLOCK", label: "阻断（不识别为人名）" },
  { value: "WARN",  label: "警告（标记但保留）" }
];

export function getNamePatternRuleTypeLabel(ruleType: string): string {
  return NAME_PATTERN_RULE_TYPES.find((r) => r.value === ruleType)?.label ?? ruleType;
}

export function getNamePatternActionLabel(action: string): string {
  return NAME_PATTERN_ACTIONS.find((a) => a.value === action)?.label ?? action;
}

export async function fetchNamePatterns(params?: {
  ruleType?: NamePatternRuleType;
  action?  : NamePatternAction;
  page?    : number;
  pageSize?: number;
}): Promise<NamePatternRuleItem[]> {
  const sp = new URLSearchParams();
  if (params?.ruleType) sp.set("ruleType", params.ruleType);
  if (params?.action) sp.set("action", params.action);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<NamePatternRuleItem[]>(
    `/api/admin/knowledge/name-patterns${qs}`
  );
}

export async function createNamePattern(data: {
  ruleType    : NamePatternRuleType;
  pattern     : string;
  action      : NamePatternAction;
  description?: string;
  isActive?   : boolean;
}): Promise<NamePatternRuleItem> {
  return clientFetch<NamePatternRuleItem>("/api/admin/knowledge/name-patterns", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateNamePattern(
  id  : string,
  data: {
    ruleType?    : NamePatternRuleType;
    pattern?     : string;
    action?      : NamePatternAction;
    description? : string | null;
    reviewStatus?: string;
    isActive?    : boolean;
  }
): Promise<void> {
  await clientMutate(`/api/admin/knowledge/name-patterns/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteNamePattern(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/name-patterns/${id}`, {
    method: "DELETE"
  });
}

export async function testNamePattern(params: {
  name   : string;
  ruleId?: string;
}): Promise<NamePatternTestResult> {
  return clientFetch<NamePatternTestResult>(
    "/api/admin/knowledge/name-patterns/test",
    {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(params)
    }
  );
}
