/**
 * 前端书籍类型服务层。
 * 对接 `/api/admin/knowledge/book-types` 路由族。
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

export interface BookTypeItem {
  id          : string;
  key         : string;
  name        : string;
  description : string | null;
  presetConfig: Record<string, unknown> | null;
  isActive    : boolean;
  sortOrder   : number;
  createdAt   : string;
  updatedAt   : string;
  _count      : {
    books         : number;
    knowledgePacks: number;
  };
}

export interface BookTypeOption {
  id       : string;
  key      : string;
  name     : string;
  sortOrder: number;
}

export async function fetchBookTypes(params?: { active?: boolean }): Promise<BookTypeItem[]> {
  const qs = params?.active !== undefined ? `?active=${params.active}` : "";
  return clientFetch<BookTypeItem[]>(`/api/admin/knowledge/book-types${qs}`);
}

export async function fetchActiveBookTypes(): Promise<BookTypeOption[]> {
  return clientFetch<BookTypeOption[]>("/api/book-types");
}

export async function fetchBookType(id: string): Promise<BookTypeItem> {
  return clientFetch<BookTypeItem>(`/api/admin/knowledge/book-types/${id}`);
}

export async function createBookType(data: {
  key: string; name: string; description?: string;
  presetConfig?: Record<string, unknown>; sortOrder?: number;
}): Promise<BookTypeItem> {
  return clientFetch<BookTypeItem>("/api/admin/knowledge/book-types", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateBookType(id: string, data: Partial<{
  key: string; name: string; description: string | null;
  presetConfig: Record<string, unknown> | null; sortOrder: number; isActive: boolean;
}>): Promise<void> {
  await clientMutate(`/api/admin/knowledge/book-types/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteBookType(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/book-types/${id}`, { method: "DELETE" });
}
