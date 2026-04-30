import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { MERGE_SUGGESTION_STATUS_VALUES } from "@/server/modules/roleWorkbench/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（合并建议 API 共享协议层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/merge-suggestions/_shared.ts`
 *
 * 在 Next.js Route Handler 链路中的作用：
 * - 为 `merge-suggestions` 相关 route 提供“可复用参数 schema + 统一 400 响应构造”；
 * - 避免每个 route.ts 重复定义校验与错误格式，保证接口行为一致。
 *
 * 维护价值：
 * - 统一返回结构后，前端只需处理一种 ValidationError 形态；
 * - 后续新增子路由时可直接复用，降低误差率。
 * =============================================================================
 */

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
 *
 * 设计原因：
 * - 参数错误属于调用方问题，应返回 400 而不是 500；
 * - 使用统一 payload 结构，方便前端展示和日志检索。
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
