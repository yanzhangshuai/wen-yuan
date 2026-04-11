import { clientFetch, clientMutate } from "@/lib/client-api";

export interface BookKnowledgePackSummary {
  id          : string;
  name        : string;
  description : string | null;
  version     : number;
  isActive    : boolean;
  scope       : string;
  bookType    : { key: string; name: string } | null;
  _count      : { entries: number; bookPacks: number };
  statusCounts: Record<string, number>;
}

export interface MountedBookKnowledgePackItem {
  id       : string;
  bookId   : string;
  packId   : string;
  priority : number;
  createdAt: string;
  pack     : BookKnowledgePackSummary;
}

export interface BookKnowledgePackListResult {
  mounted  : MountedBookKnowledgePackItem[];
  inherited: BookKnowledgePackSummary[];
}

export async function fetchBookKnowledgePacks(bookId: string): Promise<BookKnowledgePackListResult> {
  return clientFetch<BookKnowledgePackListResult>(`/api/admin/books/${encodeURIComponent(bookId)}/knowledge-packs`);
}

export async function mountBookKnowledgePack(bookId: string, data: {
  packId  : string;
  priority: number;
}): Promise<void> {
  await clientMutate(`/api/admin/books/${encodeURIComponent(bookId)}/knowledge-packs`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateMountedBookKnowledgePackPriority(
  bookId: string,
  packId: string,
  priority: number
): Promise<void> {
  await clientMutate(`/api/admin/books/${encodeURIComponent(bookId)}/knowledge-packs/${encodeURIComponent(packId)}`, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ priority })
  });
}

export async function unmountBookKnowledgePack(bookId: string, packId: string): Promise<void> {
  await clientMutate(`/api/admin/books/${encodeURIComponent(bookId)}/knowledge-packs/${encodeURIComponent(packId)}`, {
    method: "DELETE"
  });
}
