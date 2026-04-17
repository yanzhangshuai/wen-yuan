import { clientFetch, clientMutate } from "@/lib/client-api";

export interface GenericTitleItem {
  id            : string;
  title         : string;
  tier          : "SAFETY" | "DEFAULT" | "RELATIONAL";
  exemptInGenres: string[] | null;
  description   : string | null;
  isActive      : boolean;
  source        : string;
  createdAt     : string;
  updatedAt     : string;
}

export interface GenericTitleGenerationPreview {
  targetCount      : number;
  referenceBookType: {
    id  : string;
    key : string;
    name: string;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface GeneratedGenericTitleCandidate {
  title            : string;
  tier             : "SAFETY" | "DEFAULT" | "RELATIONAL";
  exemptInGenres   : string[];
  description      : string | null;
  confidence       : number;
  overlapTitle     : string | null;
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface GenericTitleGenerationReviewResult extends GenericTitleGenerationPreview {
  candidates: GeneratedGenericTitleCandidate[];
  skipped   : number;
  rawContent: string;
  model: {
    id       : string;
    provider : string;
    modelName: string;
  };
}

export interface GenericTitleTestResult {
  title : string;
  genre : string | null;
  result: string;
  reason: string;
  tier  : string | null;
}

export interface GenericTitleGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: GenericTitleGenerationReviewResult | null;
  error : string | null;
}

export async function fetchGenericTitles(params?: {
  tier?: string;
  q?   : string;
}): Promise<GenericTitleItem[]> {
  const sp = new URLSearchParams();
  if (params?.tier) sp.set("tier", params.tier);
  if (params?.q) sp.set("q", params.q);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<GenericTitleItem[]>(`/api/admin/knowledge/title-filters${qs}`);
}

export async function createGenericTitle(data: {
  title          : string;
  tier?          : "SAFETY" | "DEFAULT" | "RELATIONAL";
  exemptInGenres?: string[];
  description?   : string;
  source?        : "MANUAL" | "LLM_SUGGESTED" | "IMPORTED";
}): Promise<GenericTitleItem> {
  return clientFetch<GenericTitleItem>("/api/admin/knowledge/title-filters", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateGenericTitle(id: string, data: {
  tier?          : "SAFETY" | "DEFAULT" | "RELATIONAL";
  exemptInGenres?: string[] | null;
  description?   : string;
  isActive?      : boolean;
}): Promise<void> {
  await clientMutate(`/api/admin/knowledge/title-filters/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteGenericTitle(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/title-filters/${id}`, {
    method: "DELETE"
  });
}

export type GenericTitleBatchActionInput =
  | { action: "delete" | "enable" | "disable"; ids: string[] }
  | { action: "changeBookType"; ids: string[]; bookTypeId: string | null };

export async function batchGenericTitleAction(body: GenericTitleBatchActionInput): Promise<{ count: number }> {
  return clientFetch<{ count: number }>("/api/admin/knowledge/title-filters/batch", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function testGenericTitle(title: string, genreKey?: string): Promise<GenericTitleTestResult> {
  return clientFetch<GenericTitleTestResult>("/api/admin/knowledge/title-filters/test", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ title, genreKey })
  });
}

export async function previewGenericTitleGenerationPrompt(params?: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
}): Promise<GenericTitleGenerationPreview> {
  const sp = new URLSearchParams();
  if (params?.targetCount) sp.set("targetCount", String(params.targetCount));
  if (params?.additionalInstructions) sp.set("additionalInstructions", params.additionalInstructions);
  if (params?.referenceBookTypeId) sp.set("referenceBookTypeId", params.referenceBookTypeId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<GenericTitleGenerationPreview>(`/api/admin/knowledge/title-filters/generate/preview-prompt${qs}`);
}

export async function reviewGeneratedGenericTitles(data?: {
  targetCount?           : number;
  additionalInstructions?: string;
  referenceBookTypeId?   : string;
  modelId?               : string;
}): Promise<{ jobId: string }> {
  return clientFetch<{ jobId: string }>("/api/admin/knowledge/title-filters/generate", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data ?? {})
  });
}

export async function pollTitleFilterGenerationJob(jobId: string): Promise<GenericTitleGenerationJobStatus> {
  return clientFetch<GenericTitleGenerationJobStatus>(
    `/api/admin/knowledge/title-filters/generate?jobId=${encodeURIComponent(jobId)}`
  );
}
