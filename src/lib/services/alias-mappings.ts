/**
 * @module alias-mappings
 * @description 别名映射客户端服务层
 *
 * 封装别名映射审核所需的所有 HTTP 请求，对应后端路由 `/api/books/[id]/alias-mappings/*`。
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

export interface AliasMappingItem {
  id          : string;
  bookId      : string;
  alias       : string;
  resolvedName: string | null;
  aliasType   : string;
  personaId   : string | null;
  confidence  : number;
  evidence    : string | null;
  status      : string;
  chapterStart: number | null;
  chapterEnd  : number | null;
  createdAt   : string;
}

/* ------------------------------------------------
   Fetch
   ------------------------------------------------ */

/** 获取指定书籍的别名映射列表，可按状态筛选。 */
export async function fetchAliasMappings(
  bookId: string,
  status?: string
): Promise<AliasMappingItem[]> {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  const qs = params.toString();
  return clientFetch<AliasMappingItem[]>(
    `/api/books/${bookId}/alias-mappings${qs ? `?${qs}` : ""}`
  );
}

/* ------------------------------------------------
   Mutations
   ------------------------------------------------ */

/** 确认一条别名映射。 */
export async function confirmAliasMapping(bookId: string, mappingId: string): Promise<void> {
  return clientMutate(`/api/books/${bookId}/alias-mappings/${mappingId}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ status: "CONFIRMED" })
  });
}

/** 拒绝一条别名映射。 */
export async function rejectAliasMapping(bookId: string, mappingId: string): Promise<void> {
  return clientMutate(`/api/books/${bookId}/alias-mappings/${mappingId}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ status: "REJECTED" })
  });
}

/** 手动创建一条别名映射。 */
export async function createAliasMapping(bookId: string, body: {
  alias       : string;
  resolvedName: string;
  aliasType   : string;
  personaId?  : string;
}): Promise<void> {
  return clientMutate(`/api/books/${bookId}/alias-mappings`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
