import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  acceptSuggestionForReviewCenter,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
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
 * 文件定位（Next.js Route Handler：审核中心·接受合并建议）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/books/[id]/merge-suggestions/[suggestionId]/accept/route.ts`
 *
 * 路由语义：
 * - `POST /api/admin/books/:id/merge-suggestions/:suggestionId/accept`
 *
 * 与全局 `/api/admin/merge-suggestions/:id/accept` 的区别：
 * - 本接口强制校验建议归属书籍（防越权）；
 * - 本接口按 source 分派：
 *   - `STAGE_B5_TEMPORAL`（冒名候选）：只改状态，不合并 persona；
 *   - 其他来源：走全量合并事务。
 * - 分派规则在服务层 `acceptSuggestionForReviewCenter`，本 route 只做 HTTP 映射。
 * =============================================================================
 */

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string; suggestionId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/merge-suggestions/[suggestionId]/accept";

  try {
    // 写操作必须 ADMIN：可能触发 persona 合并事务（biography/mention/relationship 迁移）。
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

    const data = await acceptSuggestionForReviewCenter(
      parsedParams.data.id,
      parsedParams.data.suggestionId
    );

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/merge-suggestions/${parsedParams.data.suggestionId}/accept`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_MERGE_SUGGESTION_ACCEPTED",
      message: "合并建议已接受",
      data
    });
  } catch (error) {
    if (error instanceof MergeSuggestionNotFoundError) {
      return reviewCenterNotFoundJson(routePath, requestId, startedAt, error);
    }
    if (error instanceof MergeSuggestionStateError || error instanceof PersonaMergeConflictError) {
      return reviewCenterConflictJson(routePath, requestId, startedAt, error);
    }
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "接受合并建议失败"
    });
  }
}
