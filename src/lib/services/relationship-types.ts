import { clientFetch, clientMutate } from "@/lib/client-api";

export const RELATIONSHIP_TYPE_GROUPS = ["血缘", "姻亲", "师承", "社会身份", "权力关系", "利益关系", "情感关系", "对立关系", "其他"] as const;
export const RELATIONSHIP_DIRECTION_MODES = ["SYMMETRIC", "INVERSE", "DIRECTED"] as const;
export const RELATIONSHIP_TYPE_STATUSES = ["ACTIVE", "INACTIVE", "PENDING_REVIEW"] as const;

export type RelationshipTypeGroup = typeof RELATIONSHIP_TYPE_GROUPS[number];
export type RelationshipDirectionMode = typeof RELATIONSHIP_DIRECTION_MODES[number];
export type RelationshipTypeStatus = typeof RELATIONSHIP_TYPE_STATUSES[number];

export interface RelationshipTypeItem {
  id              : string;
  code            : string;
  name            : string;
  group           : RelationshipTypeGroup;
  directionMode   : RelationshipDirectionMode;
  sourceRoleLabel : string | null;
  targetRoleLabel : string | null;
  edgeLabel       : string;
  reverseEdgeLabel: string | null;
  aliases         : string[];
  description     : string | null;
  usageNotes      : string | null;
  examples        : string[];
  color           : string | null;
  sortOrder       : number;
  status          : RelationshipTypeStatus;
  source          : string;
  createdAt       : string;
  updatedAt       : string;
  _count?         : {
    relationships: number;
  };
}

export interface RelationshipTypePayload {
  name             : string;
  group            : RelationshipTypeGroup;
  directionMode    : RelationshipDirectionMode;
  sourceRoleLabel? : string | null;
  targetRoleLabel? : string | null;
  edgeLabel?       : string | null;
  reverseEdgeLabel?: string | null;
  aliases?         : string[];
  description?     : string | null;
  usageNotes?      : string | null;
  examples?        : string[];
  color?           : string | null;
  sortOrder?       : number;
  status?          : RelationshipTypeStatus;
}

export type RelationshipTypeBatchActionInput =
  | { action: "delete" | "enable" | "disable" | "markPendingReview"; ids: string[] }
  | { action: "changeGroup"; ids: string[]; group: RelationshipTypeGroup };

export interface InitializeCommonRelationshipTypesResult {
  total          : number;
  created        : number;
  skipped        : number;
  skippedExisting: number;
  skippedConflict: number;
}

export interface RelationshipTypeGenerationPreview {
  targetCount : number;
  targetGroup : string | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface GeneratedRelationshipTypeCandidate extends RelationshipTypePayload {
  edgeLabel        : string;
  aliases          : string[];
  examples         : string[];
  confidence       : number;
  conflictWith     : string | null;
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface RelationshipTypeGenerationReviewResult extends RelationshipTypeGenerationPreview {
  candidates     : GeneratedRelationshipTypeCandidate[];
  skipped        : number;
  skippedExisting: number;
  rawContent     : string;
  model: {
    id       : string;
    provider : string;
    modelName: string;
  };
}

export interface RelationshipTypeGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: RelationshipTypeGenerationReviewResult | null;
  error : string | null;
}

export async function fetchRelationshipTypes(params?: {
  q?            : string;
  group?        : string;
  directionMode?: string;
  status?       : string;
}): Promise<RelationshipTypeItem[]> {
  const sp = new URLSearchParams();
  if (params?.q) sp.set("q", params.q);
  if (params?.group) sp.set("group", params.group);
  if (params?.directionMode) sp.set("directionMode", params.directionMode);
  if (params?.status) sp.set("status", params.status);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<RelationshipTypeItem[]>(`/api/admin/knowledge/relationship-types${qs}`);
}

export async function createRelationshipType(data: RelationshipTypePayload): Promise<RelationshipTypeItem> {
  return clientFetch<RelationshipTypeItem>("/api/admin/knowledge/relationship-types", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateRelationshipType(id: string, data: Partial<RelationshipTypePayload>): Promise<RelationshipTypeItem> {
  return clientFetch<RelationshipTypeItem>(`/api/admin/knowledge/relationship-types/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteRelationshipType(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/relationship-types/${id}`, { method: "DELETE" });
}

export async function batchRelationshipTypeAction(body: RelationshipTypeBatchActionInput): Promise<{ count: number }> {
  return clientFetch<{ count: number }>("/api/admin/knowledge/relationship-types/batch", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function initializeCommonRelationshipTypes(): Promise<InitializeCommonRelationshipTypesResult> {
  return clientFetch<InitializeCommonRelationshipTypesResult>("/api/admin/knowledge/relationship-types/initialize-common", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({})
  });
}

export async function previewRelationshipTypeGenerationPrompt(params?: {
  targetCount?           : number;
  targetGroup?           : string;
  additionalInstructions?: string;
}): Promise<RelationshipTypeGenerationPreview> {
  const sp = new URLSearchParams();
  if (params?.targetCount) sp.set("targetCount", String(params.targetCount));
  if (params?.targetGroup) sp.set("targetGroup", params.targetGroup);
  if (params?.additionalInstructions) sp.set("additionalInstructions", params.additionalInstructions);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<RelationshipTypeGenerationPreview>(`/api/admin/knowledge/relationship-types/generate/preview-prompt${qs}`);
}

export async function reviewGeneratedRelationshipTypes(data?: {
  targetCount?           : number;
  targetGroup?           : string;
  additionalInstructions?: string;
  modelId?               : string;
}): Promise<{ jobId: string }> {
  return clientFetch<{ jobId: string }>("/api/admin/knowledge/relationship-types/generate", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data ?? {})
  });
}

export async function pollRelationshipTypeGenerationJob(jobId: string): Promise<RelationshipTypeGenerationJobStatus> {
  return clientFetch<RelationshipTypeGenerationJobStatus>(
    `/api/admin/knowledge/relationship-types/generate?jobId=${encodeURIComponent(jobId)}`
  );
}
