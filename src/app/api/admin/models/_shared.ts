import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

import { z } from "zod";

/** 模型路由参数 Schema（`/api/admin/models/:id`）。 */
export const modelRouteParamsSchema = z.object({
  /** 模型主键 UUID。 */
  id: z.string().uuid("模型 ID 不合法")
});

/** 更新模型配置请求体 Schema。 */
export const updateModelBodySchema = z.object({
  /** 模型标识（如 deepseek-chat / qwen-plus / ep-xxxxxx）。 */
  modelId  : z.string().trim().min(1, "模型标识不能为空").optional(),
  /** API Key（允许传 `null` 表示清空）。 */
  apiKey   : z.string().trim().min(1, "API Key 不能为空").nullable().optional(),
  /** 自定义 BaseURL（需是完整 URL）。 */
  baseUrl  : z.string().trim().url("BaseURL 格式不合法").optional(),
  /** 是否启用该模型。 */
  isEnabled: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "至少提供一个可更新字段"
});

/**
 * 功能：构造统一的 400 参数错误响应。
 * 输入：path、requestId、startedAt、detail、可选 message。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
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
