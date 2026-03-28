/**
 * @module biography
 * @description 传记事件（BiographyRecord）客户端服务层
 *
 * 封装所有与传记事件相关的 HTTP 请求，对应后端路由 `/api/biography/*`。
 *
 * 包含内容：
 * - PatchBiographyBody：编辑传记事件时的请求体类型
 * - patchBiography：更新传记事件字段（差量 PATCH）
 */
import { clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 编辑传记事件的请求体
 * 所有字段均为可选，只传需要变更的字段（差量 PATCH）。
 * category 取值范围：BIRTH / EXAM / CAREER / TRAVEL / SOCIAL / DEATH / EVENT。
 */
export interface PatchBiographyBody {
  category?: string;
  title?   : string | null;
  location?: string | null;
  event?   : string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 更新传记事件字段（差量 PATCH）。
 * 对应接口：PATCH /api/biography/:id
 *
 * 调用方只传需要变更的字段，未传字段保持原值。
 * 失败时抛出 Error，message 为可直接展示给用户的文案。
 *
 * @param id   传记记录 UUID
 * @param body 变更字段
 */
export async function patchBiography(id: string, body: PatchBiographyBody): Promise<void> {
  await clientMutate(`/api/biography/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}
