import { z } from "zod";

import {
  createApiMeta,
  errorResponse,
  toNextJson
} from "@/server/http/api-response";
import {
  type MergeSuggestionNotFoundError,
  type MergeSuggestionStateError,
  type PersonaMergeConflictError,
  REVIEW_CENTER_TABS
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（书籍审核中心合并建议 API 共享协议层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/books/[id]/merge-suggestions/_shared.ts`
 *
 * 在 Next.js Route Handler 链路中的作用：
 * - 为 `/api/admin/books/:id/merge-suggestions` 与子路径（accept/reject）提供
 *   可复用的参数 schema 与错误响应构造；
 * - 通过收敛校验规则避免同类路由重复定义。
 *
 * 与 `/api/admin/merge-suggestions/_shared.ts` 的关系：
 * - 后者是全局列表接口的 schema；
 * - 本模块是书籍维度（审核中心）接口的 schema，包含 `suggestionId`、`tab` 等额外字段；
 * - 两者独立存在，避免一方演进影响另一方。
 * =============================================================================
 */

/**
 * 审核中心书籍维度路由参数。
 * - `id` 是书籍 UUID；用于校验调用方是否越权操作其他书的建议。
 */
export const reviewCenterBookParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

/**
 * 审核中心具体建议维度路由参数。
 * - `suggestionId` 为 `MergeSuggestion.id`；
 * - 与 `id` 配合在服务层做 bookId 校验（防越权）。
 */
export const reviewCenterSuggestionParamsSchema = z.object({
  id          : z.string().uuid("书籍 ID 不合法"),
  suggestionId: z.string().uuid("合并建议 ID 不合法")
});

/**
 * 审核中心列表查询 Schema。
 * - `tab` 决定返回哪一类建议（merge/impersonation/done），是审核中心业务契约；
 * - 不附 `status` 参数：Tab 语义已覆盖状态维度，避免两者冲突。
 */
export const reviewCenterListQuerySchema = z.object({
  tab: z.enum(REVIEW_CENTER_TABS).default("merge")
});

/**
 * 功能：构造书籍审核中心模块的统一 400 错误响应。
 * 为什么独立定义：
 * - 该模块不依赖全局 merge-suggestions `_shared`，保持路径内聚；
 * - 前端可仅关注本模块 detail 文案。
 */
export function reviewCenterBadRequestJson(
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
 * 功能：构造"建议不存在或不属于当前书籍"的 404 响应。
 */
export function reviewCenterNotFoundJson(
  path: string,
  requestId: string,
  startedAt: number,
  error: MergeSuggestionNotFoundError
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "合并建议不存在",
      {
        type  : "NotFoundError",
        detail: error.message
      },
      meta
    ),
    404
  );
}

/**
 * 功能：构造"建议状态/人物冲突"的 409 响应。
 */
export function reviewCenterConflictJson(
  path: string,
  requestId: string,
  startedAt: number,
  error: MergeSuggestionStateError | PersonaMergeConflictError
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "当前合并建议无法执行该操作",
      {
        type  : "ConflictError",
        detail: error.message
      },
      meta
    ),
    409
  );
}
