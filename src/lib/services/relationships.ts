/**
 * =============================================================================
 * 文件定位（关系模块客户端服务层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/lib/services/relationships.ts`
 *
 * 在 Next.js 项目中的角色：
 * - 属于前端数据访问层（service）；
 * - 通过 `/api/books/:id/relationships` 与 `/api/relationships/:id` Route Handler 交互。
 *
 * 核心业务职责：
 * - 提供书级关系创建与审核字段修订能力；
 * - 章节级证据由 RelationshipEvent 后续接口维护，不从关系主表接口传输。
 * =============================================================================
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

export type RelationshipStatus = "DRAFT" | "VERIFIED" | "REJECTED";
export type RelationshipRecordSource = "DRAFT_AI" | "AI" | "MANUAL";

export interface PatchRelationshipBody {
  relationshipTypeCode?: string;
  status?              : RelationshipStatus;
  recordSource?        : RelationshipRecordSource;
}

export interface CreateRelationshipBody {
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
}

export async function patchRelationship(id: string, body: PatchRelationshipBody): Promise<void> {
  await clientMutate(`/api/relationships/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function createRelationship(bookId: string, body: CreateRelationshipBody): Promise<void> {
  await clientFetch(`/api/books/${encodeURIComponent(bookId)}/relationships`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
