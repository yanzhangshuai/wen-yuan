import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  rejectSuggestionForReviewCenter
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import {
  reviewCenterBadRequestJson,
  reviewCenterConflictJson,
  reviewCenterNotFoundJson,
  reviewCenterSuggestionParamsSchema
} from "../../_shared";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：审核中心·拒绝合并建议）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/books/[id]/merge-suggestions/[suggestionId]/reject/route.ts`
 *
 * 路由语义：
 * - `POST /api/admin/books/:id/merge-suggestions/:suggestionId/reject`
 * - 只更新建议状态为 REJECTED，不触发任何 persona 变更；
 * - 与接受动作分开：即使前端误传 accept 也不会穿透到本接口的业务规则。
 *
 * 与全局 reject 的区别：
 * - 本路由强制校验 bookId 归属，避免跨书操作。
 * =============================================================================
 */

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; suggestionId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/merge-suggestions/[suggestionId]/reject";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = reviewCenterSuggestionParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return reviewCenterBadRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await rejectSuggestionForReviewCenter(
      parsedParams.data.id,
      parsedParams.data.suggestionId
    );

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/merge-suggestions/${parsedParams.data.suggestionId}/reject`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_MERGE_SUGGESTION_REJECTED",
      message: "合并建议已拒绝",
      data
    });
  } catch (error) {
    if (error instanceof MergeSuggestionNotFoundError) {
      return reviewCenterNotFoundJson(routePath, requestId, startedAt, error);
    }
    if (error instanceof MergeSuggestionStateError) {
      return reviewCenterConflictJson(routePath, requestId, startedAt, error);
    }
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "拒绝合并建议失败"
    });
  }
}
