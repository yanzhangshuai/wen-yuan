import { clientFetch, clientMutate } from "@/lib/client-api";

export interface SurnameItem {
  id         : string;
  surname    : string;
  isCompound : boolean;
  priority   : number;
  description: string | null;
  bookTypeId : string | null;
  isActive   : boolean;
  source     : string;
  createdAt  : string;
  updatedAt  : string;
  bookType?: {
    id  : string;
    key : string;
    name: string;
  } | null;
}

export interface SurnameGenerationPreview {
  targetCount      : number;
  referenceBookType: {
    id  : string;
    key : string;
    name: string;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface GeneratedSurnameCandidate {
  surname          : string;
  isCompound       : boolean;
  priority         : number;
  description      : string | null;
  confidence       : number;
  overlapSurname   : string | null;
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface SurnameGenerationReviewResult extends SurnameGenerationPreview {
  candidates: GeneratedSurnameCandidate[];
  skipped   : number;
  rawContent: string;
  model: {
    id       : string;
    provider : string;
    modelName: string;
  };
}

export interface SurnameImportResult {
  total  : number;
  created: number;
  skipped: number;
}

export interface SurnameTestResult {
  input           : string;
  extractedSurname: string | null;
  matchType       : string;
  priority        : number;
}

export async function fetchSurnames(params?: {
  compound?: boolean;
  q?       : string;
}): Promise<SurnameItem[]> {
  const sp = new URLSearchParams();
  if (typeof params?.compound === "boolean") sp.set("compound", String(params.compound));
  if (params?.q) sp.set("q", params.q);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<SurnameItem[]>(`/api/admin/knowledge/surnames${qs}`);
}

export async function createSurname(data: {
  surname     : string;
  isCompound? : boolean;
  priority?   : number;
  description?: string;
  bookTypeId? : string;
  source?     : "MANUAL" | "LLM_SUGGESTED" | "IMPORTED";
}): Promise<SurnameItem> {
  return clientFetch<SurnameItem>("/api/admin/knowledge/surnames", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateSurname(id: string, data: {
  priority?   : number;
  description?: string;
  bookTypeId? : string | null;
  isActive?   : boolean;
}): Promise<void> {
  await clientMutate(`/api/admin/knowledge/surnames/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteSurname(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/surnames/${id}`, {
    method: "DELETE"
  });
}

export type SurnameBatchActionInput =
  | { action: "delete" | "enable" | "disable"; ids: string[] }
  | { action: "changeBookType"; ids: string[]; bookTypeId: string | null };

export async function batchSurnameAction(body: SurnameBatchActionInput): Promise<{ count: number }> {
  return clientFetch<{ count: number }>("/api/admin/knowledge/surnames/batch", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function importSurnames(text: string): Promise<SurnameImportResult> {
  return clientFetch<SurnameImportResult>("/api/admin/knowledge/surnames/import", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ text })
  });
}

export async function testSurnameExtraction(name: string): Promise<SurnameTestResult> {
  return clientFetch<SurnameTestResult>("/api/admin/knowledge/surnames/test", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ name })
  });
}

export async function previewSurnameGenerationPrompt(params?: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
}): Promise<SurnameGenerationPreview> {
  const sp = new URLSearchParams();
  if (params?.targetCount) sp.set("targetCount", String(params.targetCount));
  if (params?.additionalInstructions) sp.set("additionalInstructions", params.additionalInstructions);
  if (params?.referenceBookTypeId) sp.set("referenceBookTypeId", params.referenceBookTypeId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<SurnameGenerationPreview>(`/api/admin/knowledge/surnames/generate/preview-prompt${qs}`);
}

export interface SurnameGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: SurnameGenerationReviewResult | null;
  error : string | null;
}

export async function reviewGeneratedSurnames(data?: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
  modelId?               : string;
}): Promise<{ jobId: string }> {
  return clientFetch<{ jobId: string }>("/api/admin/knowledge/surnames/generate", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data ?? {})
  });
}

export async function pollSurnameGenerationJob(jobId: string): Promise<SurnameGenerationJobStatus> {
  return clientFetch<SurnameGenerationJobStatus>(
    `/api/admin/knowledge/surnames/generate?jobId=${encodeURIComponent(jobId)}`
  );
}
