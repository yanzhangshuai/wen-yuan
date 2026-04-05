import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  acceptMergeSuggestion,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, mergeSuggestionRouteParamsSchema } from "../../_shared";
import { conflictJson, notFoundJson } from "../_shared";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：接受合并建议）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/merge-suggestions/[id]/accept/route.ts`
 *
 * 路由约定语义：
 * - 目录中的 `[id]` 是动态路由段；
 * - `route.ts` 暴露 HTTP 方法处理器；
 * - 本文件对应：`POST /api/admin/merge-suggestions/:id/accept`。
 *
 * 核心职责：
 * 1) 解析并校验路由参数 `id`；
 * 2) 执行管理员鉴权；
 * 3) 调用领域服务 `acceptMergeSuggestion` 执行真实合并事务；
 * 4) 将领域异常映射为标准 HTTP 语义（404/409）。
 *
 * 重要说明：
 * - “接受建议”是有副作用写操作，可能改动多张表（人物/关系/传记/提及）；
 * - 本层只做协议映射，不自行实现合并细节。
 * =============================================================================
 */

/**
 * POST `/api/admin/merge-suggestions/:id/accept`
 * 功能：接受合并建议并执行人物合并。
 * 入参：路由参数 `id`（合并建议 UUID）。
 * 返回：更新后的合并建议详情（状态为 ACCEPTED）。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/merge-suggestions/[id]/accept";

  try {
    // 鉴权边界：管理员才允许执行合并，避免普通用户触发高风险写操作。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // Next.js 在 Route Handler 中通过 context.params 提供动态段参数。
    const parsedParams = mergeSuggestionRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await acceptMergeSuggestion(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/merge-suggestions/${parsedParams.data.id}/accept`,
      requestId,
      startedAt,
      code   : "ADMIN_MERGE_SUGGESTION_ACCEPTED",
      message: "合并建议已接受",
      data
    });
  } catch (error) {
    // 分支 1：建议不存在 -> 404。
    if (error instanceof MergeSuggestionNotFoundError) {
      return notFoundJson(routePath, requestId, startedAt, error);
    }

    // 分支 2：状态冲突 / 人物冲突 -> 409。
    if (error instanceof MergeSuggestionStateError || error instanceof PersonaMergeConflictError) {
      return conflictJson(routePath, requestId, startedAt, error);
    }

    // 分支 3：兜底未知异常 -> 500。
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
