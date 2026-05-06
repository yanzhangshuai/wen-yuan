import { clientFetch } from "@/lib/client-api";
import type { RelationshipTypePayload } from "@/lib/services/relationship-types";

export const UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES = ["PENDING", "APPROVED", "REJECTED", "MERGED"] as const;
export type UnknownRelationshipTypeDraftStatus = typeof UNKNOWN_RELATIONSHIP_TYPE_DRAFT_STATUSES[number];

export interface UnknownRelationshipTypeOccurrenceItem {
  id             : string;
  draftId        : string;
  bookId         : string;
  chapterId      : string;
  jobId          : string | null;
  sourceName     : string;
  targetName     : string;
  sourcePersonaId: string | null;
  targetPersonaId: string | null;
  evidence       : string | null;
  createdAt      : string;
  chapter        : {
    id   : string;
    no   : number;
    title: string;
  };
}

export interface UnknownRelationshipTypeDraftItem {
  id                     : string;
  bookId                 : string;
  firstChapterId         : string;
  firstJobId             : string | null;
  signature              : string;
  proposedName           : string;
  proposedGroup          : string;
  proposedDirectionMode  : RelationshipTypePayload["directionMode"];
  proposedSourceRoleLabel: string | null;
  proposedTargetRoleLabel: string | null;
  occurrenceCount        : number;
  status                 : UnknownRelationshipTypeDraftStatus;
  rejectionReason        : string | null;
  approvedTypeCode       : string | null;
  mergedIntoDraftId      : string | null;
  createdAt              : string;
  updatedAt              : string;
  book                   : {
    id        : string;
    title     : string;
    bookTypeId: string | null;
    bookType  : { id: string; key: string; name: string } | null;
  };
  firstChapter           : {
    id   : string;
    no   : number;
    title: string;
  };
  occurrences    : UnknownRelationshipTypeOccurrenceItem[];
  mergedIntoDraft: { id: string; proposedName: string } | null;
}

export async function fetchUnknownRelationshipTypeDrafts(params?: {
  status?: UnknownRelationshipTypeDraftStatus;
  bookId?: string;
}): Promise<UnknownRelationshipTypeDraftItem[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.bookId) sp.set("bookId", params.bookId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<UnknownRelationshipTypeDraftItem[]>(`/api/admin/knowledge/unknown-relationship-types${qs}`);
}

export async function approveUnknownRelationshipTypeDraft(
  id: string,
  body:
    | { mode: "BIND_EXISTING"; relationshipTypeCode: string }
    | { mode: "CREATE_NEW"; input: RelationshipTypePayload }
): Promise<UnknownRelationshipTypeDraftItem> {
  return clientFetch<UnknownRelationshipTypeDraftItem>(`/api/admin/knowledge/unknown-relationship-types/${id}/approve`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function rejectUnknownRelationshipTypeDraft(
  id: string,
  rejectionReason?: string | null
): Promise<UnknownRelationshipTypeDraftItem> {
  return clientFetch<UnknownRelationshipTypeDraftItem>(`/api/admin/knowledge/unknown-relationship-types/${id}/reject`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ rejectionReason: rejectionReason ?? null })
  });
}

export async function mergeUnknownRelationshipTypeDraft(
  id: string,
  targetDraftId: string
): Promise<UnknownRelationshipTypeDraftItem> {
  return clientFetch<UnknownRelationshipTypeDraftItem>(`/api/admin/knowledge/unknown-relationship-types/${id}/merge`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ targetDraftId })
  });
}
