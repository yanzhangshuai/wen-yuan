import { z } from "zod";

const apiPaginationSchema = z.object({
  page    : z.number(),
  pageSize: z.number(),
  total   : z.number()
});

const apiMetaSchema = z.object({
  requestId : z.string(),
  timestamp : z.string(),
  path      : z.string(),
  durationMs: z.number().optional(),
  pagination: apiPaginationSchema.optional()
});

const apiErrorDetailSchema = z.object({
  type  : z.string(),
  detail: z.string().optional(),
  field : z.string().optional()
});

const apiSuccessResponseSchema = z.object({
  success: z.literal(true),
  code   : z.string(),
  message: z.string(),
  data   : z.unknown(),
  meta   : apiMetaSchema
});

const apiErrorResponseSchema = z.object({
  success: z.literal(false),
  code   : z.string(),
  message: z.string(),
  error  : apiErrorDetailSchema,
  meta   : apiMetaSchema
});

const apiResponseSchema = z.union([apiSuccessResponseSchema, apiErrorResponseSchema]);

type ParsedApiResponse = z.infer<typeof apiResponseSchema>;
type ParsedApiSuccessResponse = z.infer<typeof apiSuccessResponseSchema>;

/**
 * 功能：按统一 API contract 解析客户端 payload。
 * 输入：`payload`（`fetch().json()` 返回的 unknown）。
 * 输出：符合 contract 时返回 ApiResponse，否则返回 null。
 * 异常：无。
 * 副作用：无。
 */
export function readApiResponse(payload: unknown): ParsedApiResponse | null {
  const parsed = apiResponseSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }

  return parsed.data;
}

/**
 * 功能：提取成功响应对象。
 * 输入：`payload`（unknown）。
 * 输出：成功时返回成功响应，失败或非法结构返回 null。
 * 异常：无。
 * 副作用：无。
 */
export function readApiSuccessResponse(payload: unknown): ParsedApiSuccessResponse | null {
  const response = readApiResponse(payload);
  if (!response || !response.success) {
    return null;
  }

  return response;
}

/**
 * 功能：从响应中提取最适合展示给用户的错误信息。
 * 输入：`payload`（unknown）、`fallback`（兜底文案）。
 * 输出：可展示错误文案。
 * 异常：无。
 * 副作用：无。
 */
export function readApiErrorMessage(payload: unknown, fallback = "请求失败，请稍后重试"): string {
  const response = readApiResponse(payload);
  if (!response) {
    return fallback;
  }

  if (response.success) {
    return response.message || fallback;
  }

  return response.error.detail || response.message || fallback;
}
