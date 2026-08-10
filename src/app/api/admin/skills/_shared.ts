import { z } from "zod";

import { SkillStatus as SkillStatusEnum } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * 技能管理接口族（列表/详情 + 编辑/启停/内容保存/AI 生成）的请求体校验与错误响应辅助。
 * skill 启停由 status（ENABLED/DISABLED）承载，MD 文档内容通过独立保存接口维护。
 */

/** 基本信息更新请求体（PATCH /:id）：至少提供一个字段。 */
export const updateSkillSchema = z.object({
  name       : z.string().min(1, "名称不能为空").optional(),
  description: z.string().nullable().optional(),
  scope      : z.enum(["GLOBAL", "BOOK_TYPE"]).optional(),
  status     : z.nativeEnum(SkillStatusEnum).optional()
}).refine((data) => Object.values(data).some((value) => value !== undefined), {
  message: "至少提供一个可更新字段"
});

/** 内容保存请求体（PUT /:id/content）：MD 全文，保存即覆盖。 */
export const updateSkillContentSchema = z.object({
  content: z.string().min(1, "内容不能为空")
});

/** AI 生成请求体（POST /generate）：用途描述必填。 */
export const generateSkillSchema = z.object({
  purpose: z.string().trim().min(1, "请描述技能用途"),
  name   : z.string().trim().min(1).optional(),
  scope  : z.enum(["GLOBAL", "BOOK_TYPE"]).optional()
});

/** AI 重新生成请求体（POST /:id/regenerate）：字段可选，缺省沿用现有 skill 信息。 */
export const regenerateSkillSchema = z.object({
  purpose: z.string().trim().min(1).optional(),
  name   : z.string().trim().min(1).optional(),
  scope  : z.enum(["GLOBAL", "BOOK_TYPE"]).optional()
});

/**
 * 功能：构造统一的 400 参数错误响应。
 * 输入：path、requestId、startedAt、detail、可选 message。
 * 输出：HTTP 400 响应。
 */
export function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "请求参数不合法"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      message,
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

/**
 * 功能：构造统一的 404 资源不存在响应。
 * 输入：path、requestId、startedAt、detail。
 * 输出：HTTP 404 响应。
 */
export function notFoundJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "资源不存在",
      {
        type: "NotFoundError",
        detail
      },
      meta
    ),
    404
  );
}
