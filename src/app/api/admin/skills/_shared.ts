import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * 技能管理接口族（GET 列表/详情 + PATCH 启停切换）的请求体校验与错误响应辅助。
 * v5（阶段 5）：skill 独立启停由管理端开关维护，关系码/虚指契约只读展示。
 */

/** 启停切换请求体：isEnabled=false 表示该 skill 全局不可用。 */
export const setSkillEnabledSchema = z.object({
  isEnabled: z.boolean()
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
