/**
 * 文件定位（管理端书籍单资源接口 - 共享校验）
 * - `src/app/api/admin/books/[id]/_shared.ts`
 * - 被同级 `route.ts`（GET/PATCH 书籍基础字段）复用。
 *
 * 业务价值：
 * - 集中路由参数 & 请求体校验，避免字段规则漂移；
 * - BookTypeCode 枚举集中一次校验，前后端其它入口改动可同步更新此文件。
 */

import { z } from "zod";

import { BookTypeCode } from "@/generated/prisma/enums";

/**
 * `/api/admin/books/:id` 路由参数校验。
 * - `id` 必须是 UUID：作为接口边界防御，拦截非法字符串直连服务层。
 */
export const adminBookRouteParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

/**
 * BookTypeCode 字段 zod schema。
 * - 值域固定为 `BookTypeCode` 枚举（CLASSICAL_NOVEL/HEROIC_NOVEL/...）；
 * - 非法值统一给出中文错误文案，便于管理台直接回显。
 */
export const bookTypeCodeSchema = z.nativeEnum(BookTypeCode, {
  errorMap: () => ({ message: "BookTypeCode 取值不合法" })
});

/**
 * PATCH 请求体 schema。
 * - 目前仅支持 `typeCode` 一个字段：保持接口最小职责；
 * - 后续如需支持其它基础字段（title/author 等），在此扩展即可。
 */
export const updateAdminBookBodySchema = z.object({
  typeCode: bookTypeCodeSchema
});
