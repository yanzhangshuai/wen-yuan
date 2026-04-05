import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import {
  type MergeSuggestionNotFoundError,
  type MergeSuggestionStateError,
  type PersonaMergeConflictError
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

/**
 * =============================================================================
 * 文件定位（合并建议详情子路由共享错误映射）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/merge-suggestions/[id]/_shared.ts`
 *
 * 作用：
 * - 给 `accept/reject/defer` 三个子路由复用 404/409 响应构造逻辑；
 * - 保证不同动作在相同错误场景下返回一致的错误码与结构。
 *
 * 这是协议一致性层，不承载业务状态机。
 * =============================================================================
 */

/**
 * 功能：构造“合并建议不存在”错误响应。
 * 输入：path、requestId、startedAt、`MergeSuggestionNotFoundError`。
 * 输出：HTTP 404 响应。
 *
 * 业务语义：客户端传入的建议 ID 在当前数据集中不存在。
 */
export function notFoundJson(
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
 * 功能：构造“合并建议状态冲突”错误响应。
 * 输入：path、requestId、startedAt、状态冲突类错误对象。
 * 输出：HTTP 409 响应。
 *
 * 业务语义：
 * - 建议不是 PENDING（已被处理或状态不允许）；
 * - 或执行合并时发生人物冲突（如人物已删除）。
 */
export function conflictJson(
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
