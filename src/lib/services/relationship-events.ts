import { clientFetch, clientMutate } from "@/lib/client-api";

export type RelationshipEventStatus = "DRAFT" | "VERIFIED" | "REJECTED";
export type RelationshipEventRecordSource = "DRAFT_AI" | "AI" | "MANUAL";

export interface CreateRelationshipEventBody {
  chapterId    : string;
  summary      : string;
  evidence?    : string | null;
  attitudeTags?: string[];
  paraIndex?   : number | null;
  confidence?  : number;
}

export interface PatchRelationshipEventBody {
  chapterId?   : string;
  summary?     : string;
  evidence?    : string | null;
  attitudeTags?: string[];
  paraIndex?   : number | null;
  confidence?  : number;
  status?      : RelationshipEventStatus;
  recordSource?: RelationshipEventRecordSource;
}

export async function createRelationshipEvent(
  relationshipId: string,
  body: CreateRelationshipEventBody
): Promise<void> {
  await clientFetch(`/api/relationships/${encodeURIComponent(relationshipId)}/events`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function patchRelationshipEvent(
  eventId: string,
  body: PatchRelationshipEventBody
): Promise<void> {
  await clientMutate(`/api/relationship-events/${encodeURIComponent(eventId)}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function deleteRelationshipEvent(eventId: string): Promise<void> {
  await clientMutate(`/api/relationship-events/${encodeURIComponent(eventId)}`, {
    method: "DELETE"
  });
}
