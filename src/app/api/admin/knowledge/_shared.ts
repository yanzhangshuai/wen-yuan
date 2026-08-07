import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * 知识库 API 路由族共享校验 Schema 与工具。
 *
 * v5（阶段 5）：v4 知识库 API（book-types/alias-packs/relationship-types/generic-titles/
 * extraction-rules/prompt-templates 等）已随页面删除，仅保留 change-logs 路由族仍使用的
 * UUID 参数校验与统一错误响应辅助。
 */

export const uuidParamSchema = z.object({
  id: z.string().uuid("ID 不合法")
});

export function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "请求参数不合法"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(ERROR_CODES.COMMON_BAD_REQUEST, message, { type: "ValidationError", detail }, meta),
    400
  );
}

export function notFoundJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(ERROR_CODES.COMMON_NOT_FOUND, "资源不存在", { type: "NotFoundError", detail }, meta),
    404
  );
}
