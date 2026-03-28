/**
 * @module relationships
 * @description 关系（Relationship）客户端服务层
 *
 * 封装所有与人物关系相关的 HTTP 请求，对应后端路由 `/api/relationships/*`。
 *
 * 包含内容：
 * - PatchRelationshipBody：编辑关系时的请求体类型
 * - patchRelationship：更新关系字段（差量 PATCH）
 */
import { clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 编辑关系的请求体
 * 所有字段均为可选，只传需要变更的字段（差量 PATCH）。
 * weight 为关系热度（正整数）；confidence 为原始小数（0–1）。
 */
export interface PatchRelationshipBody {
  type?      : string;
  weight?    : number;
  evidence?  : string | null;
  confidence?: number;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 更新关系基本信息（差量 PATCH）。
 * 对应接口：PATCH /api/relationships/:id
 *
 * 调用方只传需要变更的字段，未传字段保持原值。
 * 失败时抛出 Error，message 为可直接展示给用户的文案。
 *
 * @param id   关系 UUID
 * @param body 变更字段
 */
export async function patchRelationship(id: string, body: PatchRelationshipBody): Promise<void> {
  await clientMutate(`/api/relationships/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
