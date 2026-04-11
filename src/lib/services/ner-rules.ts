import { clientFetch, clientMutate } from "@/lib/client-api";

export interface ExtractionRuleItem {
  id        : string;
  ruleType  : "ENTITY" | "RELATIONSHIP";
  content   : string;
  genreKey  : string | null;
  sortOrder : number;
  isActive  : boolean;
  changeNote: string | null;
  createdAt : string;
  updatedAt : string;
}

export interface CombinedRulesPreview {
  ruleType: string;
  genreKey: string | null;
  count   : number;
  combined: string;
  rules   : Array<Pick<ExtractionRuleItem, "id" | "content" | "genreKey" | "sortOrder">>;
}

export async function fetchExtractionRules(params?: {
  ruleType?: string;
  genreKey?: string;
}): Promise<ExtractionRuleItem[]> {
  const sp = new URLSearchParams();
  if (params?.ruleType) sp.set("ruleType", params.ruleType);
  if (params?.genreKey) sp.set("genreKey", params.genreKey);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<ExtractionRuleItem[]>(`/api/admin/knowledge/ner-rules${qs}`);
}

export async function createExtractionRule(data: {
  ruleType?  : "ENTITY" | "RELATIONSHIP";
  content    : string;
  genreKey?  : string;
  sortOrder? : number;
  changeNote?: string;
}): Promise<ExtractionRuleItem> {
  return clientFetch<ExtractionRuleItem>("/api/admin/knowledge/ner-rules", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateExtractionRule(id: string, data: {
  content?   : string;
  genreKey?  : string | null;
  sortOrder? : number;
  isActive?  : boolean;
  changeNote?: string;
}): Promise<void> {
  await clientMutate(`/api/admin/knowledge/ner-rules/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteExtractionRule(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/ner-rules/${id}`, {
    method: "DELETE"
  });
}

export async function reorderExtractionRules(ruleType: "ENTITY" | "RELATIONSHIP", orderedIds: string[]): Promise<void> {
  await clientMutate("/api/admin/knowledge/ner-rules/reorder", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ruleType, orderedIds })
  });
}

export async function previewCombinedRules(ruleType: "ENTITY" | "RELATIONSHIP", genreKey?: string): Promise<CombinedRulesPreview> {
  return clientFetch<CombinedRulesPreview>("/api/admin/knowledge/ner-rules/preview-combined", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ruleType, genreKey })
  });
}
