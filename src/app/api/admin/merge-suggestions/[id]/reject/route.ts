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
 * =============================================================================
 * 文件定位（Next.js Route Handler：拒绝合并建议）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/merge-suggestions/[id]/reject/route.ts`
 *
 * 路由语义：
 * - 对应 `POST /api/admin/merge-suggestions/:id/reject`；
 * - 只改建议状态，不做实体数据迁移。
 *
 * 业务职责：
 * 1) 管理员鉴权；
 * 2) 参数校验；
 * 3) 调用 `rejectMergeSuggestion` 执行状态变更；
 * 4) 映射领域错误到标准 HTTP 响应。
 *
 * 业务语义强调：
 * - reject 是“明确否决当前建议”，与 defer 的“稍后再议”不同；
 * - reject 不触发实体合并写入，只改变建议状态，避免误以为会修改人物主数据。
 * =============================================================================
 */

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
    // Step 1) 鉴权：建议状态变更是运营后台权限操作，仅管理员可执行。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // Step 2) 参数校验：动态路由段 `id` 必须是合法 UUID。
    const parsedParams = mergeSuggestionRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // Step 3) 执行拒绝动作，仅更新建议状态为 REJECTED。
    const data = await rejectMergeSuggestion(parsedParams.data.id);

    // Step 4) 返回结果，调用方据此更新前端建议队列状态。
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
      // 请求目标不存在 -> 404。
      return notFoundJson(routePath, requestId, startedAt, error);
    }

    // 只能处理 PENDING；若前端重复点击或并发处理，返回冲突。
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
