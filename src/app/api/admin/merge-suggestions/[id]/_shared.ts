import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import {
  type MergeSuggestionNotFoundError,
  type MergeSuggestionStateError,
  type PersonaMergeConflictError
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：构造“合并建议不存在”错误响应。
 * 输入：path、requestId、startedAt、`MergeSuggestionNotFoundError`。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
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
 * 异常：无。
 * 副作用：无。
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
