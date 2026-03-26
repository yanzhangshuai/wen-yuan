import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { MERGE_SUGGESTION_STATUS_VALUES } from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

/** 合并建议路由参数 Schema（`/api/admin/merge-suggestions/:id`）。 */
export const mergeSuggestionRouteParamsSchema = z.object({
  /** 合并建议主键 UUID。 */
  id: z.string().uuid("合并建议 ID 不合法")
});

/** 合并建议列表查询参数 Schema。 */
export const mergeSuggestionQuerySchema = z.object({
  /** 书籍 ID（可选）。 */
  bookId: z.string().uuid("书籍 ID 不合法").optional(),
  /** 建议状态（可选）。 */
  status: z.enum(MERGE_SUGGESTION_STATUS_VALUES).optional()
});

/**
 * 功能：构造合并建议模块统一 400 错误响应。
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
