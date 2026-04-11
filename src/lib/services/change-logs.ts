import { clientFetch } from "@/lib/client-api";

export interface KnowledgeChangeLogItem {
  id           : string;
  objectType   : string;
  objectId     : string;
  objectName   : string;
  action       : string;
  before       : Record<string, unknown> | null;
  after        : Record<string, unknown> | null;
  operatorId   : string | null;
  operatorNote : string | null;
  relatedBookId: string | null;
  createdAt    : string;
}

export interface KnowledgeChangeLogPage {
  items   : KnowledgeChangeLogItem[];
  total   : number;
  page    : number;
  pageSize: number;
}

export async function fetchChangeLogs(params?: {
  objectType?: string;
  objectId?  : string;
  action?    : string;
  from?      : string;
  to?        : string;
  page?      : number;
  pageSize?  : number;
}): Promise<KnowledgeChangeLogPage> {
  const sp = new URLSearchParams();
  if (params?.objectType) sp.set("objectType", params.objectType);
  if (params?.objectId) sp.set("objectId", params.objectId);
  if (params?.action) sp.set("action", params.action);
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("pageSize", String(params.pageSize));
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  return clientFetch<KnowledgeChangeLogPage>(`/api/admin/knowledge/change-logs${qs}`);
}

export async function fetchChangeLog(id: string): Promise<KnowledgeChangeLogItem> {
  return clientFetch<KnowledgeChangeLogItem>(`/api/admin/knowledge/change-logs/${id}`);
}
