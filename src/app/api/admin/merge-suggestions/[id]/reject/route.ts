import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  rejectMergeSuggestion
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, mergeSuggestionRouteParamsSchema } from "../../_shared";
import { conflictJson, notFoundJson } from "../_shared";

/**
 * POST `/api/admin/merge-suggestions/:id/reject`
 * 功能：拒绝合并建议（仅更新建议状态，不做实体变更）。
 * 入参：路由参数 `id`（合并建议 UUID）。
 * 返回：更新后的合并建议详情（状态为 REJECTED）。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/merge-suggestions/[id]/reject";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = mergeSuggestionRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await rejectMergeSuggestion(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/merge-suggestions/${parsedParams.data.id}/reject`,
      requestId,
      startedAt,
      code   : "ADMIN_MERGE_SUGGESTION_REJECTED",
      message: "合并建议已拒绝",
      data
    });
  } catch (error) {
    if (error instanceof MergeSuggestionNotFoundError) {
      return notFoundJson(routePath, requestId, startedAt, error);
    }

    if (error instanceof MergeSuggestionStateError) {
      return conflictJson(routePath, requestId, startedAt, error);
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
