import { clientFetch, clientMutate } from "@/lib/client-api";

export type PromptRuleType = "ENTITY" | "RELATIONSHIP";

export interface PromptExtractionRuleItem {
  id        : string;
  ruleType  : PromptRuleType;
  content   : string;
  bookTypeId: string | null;
  sortOrder : number;
  isActive  : boolean;
  changeNote: string | null;
  createdAt : string;
  updatedAt : string;
}

export interface CombinedPromptRulesPreview {
  ruleType  : PromptRuleType;
  bookTypeId: string | null;
  count     : number;
  combined  : string;
  rules     : Array<Pick<PromptExtractionRuleItem, "id" | "content" | "bookTypeId" | "sortOrder">>;
}

export async function fetchPromptExtractionRules(params?: {
  ruleType?  : PromptRuleType;
  bookTypeId?: string;
}): Promise<PromptExtractionRuleItem[]> {
  const sp = new URLSearchParams();
  if (params?.ruleType)   sp.set("ruleType", params.ruleType);
  if (params?.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<PromptExtractionRuleItem[]>(`/api/admin/knowledge/prompt-extraction-rules${qs}`);
}

export async function createPromptExtractionRule(data: {
  ruleType   : PromptRuleType;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}): Promise<PromptExtractionRuleItem> {
  return clientFetch<PromptExtractionRuleItem>("/api/admin/knowledge/prompt-extraction-rules", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updatePromptExtractionRule(id: string, data: {
  content?   : string;
  bookTypeId?: string | null;
  sortOrder? : number;
  isActive?  : boolean;
  changeNote?: string;
}): Promise<void> {
  await clientMutate(`/api/admin/knowledge/prompt-extraction-rules/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deletePromptExtractionRule(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/prompt-extraction-rules/${id}`, { method: "DELETE" });
}

export async function reorderPromptExtractionRules(orderedIds: string[]): Promise<void> {
  await clientMutate("/api/admin/knowledge/prompt-extraction-rules/reorder", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ orderedIds })
  });
}

export async function previewCombinedPromptRules(
  ruleType  : PromptRuleType,
  bookTypeId?: string
): Promise<CombinedPromptRulesPreview> {
  return clientFetch<CombinedPromptRulesPreview>("/api/admin/knowledge/prompt-extraction-rules/preview-combined", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ruleType, bookTypeId })
  });
}
