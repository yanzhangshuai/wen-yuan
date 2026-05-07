import { clientFetch, clientMutate } from "@/lib/client-api";

export interface ExtractionRuleItem {
  id        : string;
  ruleType  : string;
  content   : string;
  bookTypeId: string | null;
  sortOrder : number;
  isActive  : boolean;
  source    : string;
  changeNote: string | null;
  createdAt : string;
  updatedAt : string;
  bookType? : { id: string; key: string; name: string } | null;
}

export interface ExtractionRuleListParams {
  ruleType?  : string;
  bookTypeId?: string;
  active?    : boolean;
}

export async function fetchExtractionRules(params?: ExtractionRuleListParams): Promise<ExtractionRuleItem[]> {
  const searchParams = new URLSearchParams();
  if (params?.ruleType)   searchParams.set("ruleType", params.ruleType);
  if (params?.bookTypeId) searchParams.set("bookTypeId", params.bookTypeId);
  if (params?.active !== undefined) searchParams.set("active", String(params.active));

  const qs = searchParams.toString();
  return clientFetch<ExtractionRuleItem[]>(`/api/admin/knowledge/extraction-rules${qs ? `?${qs}` : ""}`);
}

export async function createExtractionRule(data: {
  ruleType   : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}): Promise<ExtractionRuleItem> {
  return clientFetch<ExtractionRuleItem>("/api/admin/knowledge/extraction-rules", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateExtractionRule(id: string, data: {
  content?   : string;
  bookTypeId?: string | null;
  sortOrder? : number;
  isActive?  : boolean;
  changeNote?: string;
}): Promise<ExtractionRuleItem> {
  return clientFetch<ExtractionRuleItem>(`/api/admin/knowledge/extraction-rules/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteExtractionRule(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/extraction-rules/${id}`, {
    method: "DELETE"
  });
}

export async function batchExtractionRuleAction(action: {
  action     : "delete" | "enable" | "disable" | "changeBookType";
  ids        : string[];
  bookTypeId?: string | null;
}): Promise<{ count: number }> {
  return clientFetch<{ count: number }>("/api/admin/knowledge/extraction-rules/batch", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(action)
  });
}

export async function reorderExtractionRules(orderedIds: string[]): Promise<void> {
  await clientMutate("/api/admin/knowledge/extraction-rules/reorder", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ orderedIds })
  });
}

export interface CombinedExtractionRulesPreview {
  ruleType  : string;
  bookTypeId: string | null;
  count     : number;
  combined  : string;
  rules     : { id: string; content: string; bookTypeId: string | null; sortOrder: number }[];
}

export async function previewExtractionRules(ruleType: string, bookTypeId?: string): Promise<CombinedExtractionRulesPreview> {
  const searchParams = new URLSearchParams({ ruleType });
  if (bookTypeId) searchParams.set("bookTypeId", bookTypeId);
  return clientFetch<CombinedExtractionRulesPreview>(`/api/admin/knowledge/extraction-rules/preview?${searchParams.toString()}`, {
    method: "POST"
  });
}
