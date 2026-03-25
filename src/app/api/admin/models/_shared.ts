import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

import { z } from "zod";

export const modelRouteParamsSchema = z.object({
  id: z.string().uuid("模型 ID 不合法")
});

export const updateModelBodySchema = z.object({
  apiKey   : z.string().trim().min(1, "API Key 不能为空").nullable().optional(),
  baseUrl  : z.string().trim().url("BaseURL 格式不合法").optional(),
  isEnabled: z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  message: "至少提供一个可更新字段"
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
