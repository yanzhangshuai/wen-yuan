import { clientFetch, clientMutate } from "@/lib/client-api";

export type NerLexiconRuleType = "HARD_BLOCK_SUFFIX" | "SOFT_BLOCK_SUFFIX" | "TITLE_STEM" | "POSITION_STEM";

export interface NerLexiconRuleItem {
  id        : string;
  ruleType  : NerLexiconRuleType;
  content   : string;
  bookTypeId: string | null;
  sortOrder : number;
  isActive  : boolean;
  changeNote: string | null;
  createdAt : string;
  updatedAt : string;
}

export interface NerLexiconGenerationPreview {
  ruleType         : NerLexiconRuleType;
  targetCount      : number;
  referenceBookType: {
    id  : string;
    key : string;
    name: string;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface NerLexiconGenerationResult {
  created: number;
  skipped: number;
  model: {
    id       : string;
    provider : string;
    modelName: string;
  };
}

export interface NerLexiconGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: NerLexiconGenerationResult | null;
  error : string | null;
}

export async function fetchNerLexiconRules(params?: {
  ruleType?  : NerLexiconRuleType;
  bookTypeId?: string;
}): Promise<NerLexiconRuleItem[]> {
  const sp = new URLSearchParams();
  if (params?.ruleType)   sp.set("ruleType", params.ruleType);
  if (params?.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<NerLexiconRuleItem[]>(`/api/admin/knowledge/ner-rules${qs}`);
}

export async function createNerLexiconRule(data: {
  ruleType   : NerLexiconRuleType;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}): Promise<NerLexiconRuleItem> {
  return clientFetch<NerLexiconRuleItem>("/api/admin/knowledge/ner-rules", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateNerLexiconRule(id: string, data: {
  content?   : string;
  bookTypeId?: string | null;
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

export async function deleteNerLexiconRule(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/ner-rules/${id}`, {
    method: "DELETE"
  });
}

export async function reorderNerLexiconRules(orderedIds: string[]): Promise<void> {
  await clientMutate("/api/admin/knowledge/ner-rules/reorder", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ orderedIds })
  });
}

export async function previewNerLexiconGenerationPrompt(params: {
  ruleType               : NerLexiconRuleType;
  targetCount?           : number;
  bookTypeId?            : string;
  additionalInstructions?: string;
}): Promise<NerLexiconGenerationPreview> {
  const sp = new URLSearchParams();
  sp.set("ruleType", params.ruleType);
  if (params.targetCount) sp.set("targetCount", String(params.targetCount));
  if (params.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  if (params.additionalInstructions) sp.set("additionalInstructions", params.additionalInstructions);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<NerLexiconGenerationPreview>(
    `/api/admin/knowledge/ner-rules/generate/preview-prompt${qs}`
  );
}

export async function generateNerLexiconRules(data: {
  ruleType               : NerLexiconRuleType;
  targetCount?           : number;
  bookTypeId?            : string;
  additionalInstructions?: string;
  modelId?               : string;
}): Promise<{ jobId: string }> {
  return clientFetch<{ jobId: string }>("/api/admin/knowledge/ner-rules/generate", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function pollNerGenerationJob(jobId: string): Promise<NerLexiconGenerationJobStatus> {
  return clientFetch<NerLexiconGenerationJobStatus>(
    `/api/admin/knowledge/ner-rules/generate?jobId=${encodeURIComponent(jobId)}`
  );
}
