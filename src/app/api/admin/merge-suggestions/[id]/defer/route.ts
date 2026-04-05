import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  deferMergeSuggestion,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
} from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, mergeSuggestionRouteParamsSchema } from "../../_shared";
import { conflictJson, notFoundJson } from "../_shared";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：暂缓合并建议）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/merge-suggestions/[id]/defer/route.ts`
 *
 * 路由语义：
 * - 对应 `POST /api/admin/merge-suggestions/:id/defer`；
 * - 将建议标记为“暂缓处理”，供后续人工复审。
 *
 * 与 reject 的区别：
 * - `REJECTED` 表示明确否决；
 * - `DEFERRED` 表示暂不决策。
 * 这是业务流程区分，不是技术限制。
 *
 * 该接口在业务流程中的位置：
 * - 通常用于“证据不足、需要更多上下文”场景；
 * - 暂缓后建议仍可在后续人工复核中重新进入处理链路。
 * =============================================================================
 */

/**
 * POST `/api/admin/merge-suggestions/:id/defer`
 * 功能：暂缓合并建议（后续可重新处理）。
 * 入参：路由参数 `id`（合并建议 UUID）。
 * 返回：更新后的合并建议详情（状态为 DEFERRED）。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/merge-suggestions/[id]/defer";

  try {
    // Step 1) 鉴权：只有管理员可改变建议状态。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // Step 2) 校验动态路由参数，避免非法 ID 进入服务层。
    const parsedParams = mergeSuggestionRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    // Step 3) 执行“暂缓”动作。
    // 业务语义：更新建议状态，不执行实体合并。
    const data = await deferMergeSuggestion(parsedParams.data.id);

    // Step 4) 返回更新后的建议数据，便于前端同步列表状态。
    return okJson({
      path   : `/api/admin/merge-suggestions/${parsedParams.data.id}/defer`,
      requestId,
      startedAt,
      code   : "ADMIN_MERGE_SUGGESTION_DEFERRED",
      message: "合并建议已暂缓",
      data
    });
  } catch (error) {
    if (error instanceof MergeSuggestionNotFoundError) {
      // 建议 ID 不存在，返回 404。
      return notFoundJson(routePath, requestId, startedAt, error);
    }

    if (error instanceof MergeSuggestionStateError) {
      // 状态冲突（例如非 PENDING）返回 409，提示调用方当前状态不可操作。
      return conflictJson(routePath, requestId, startedAt, error);
    }

    // 兜底未知异常 -> 500。
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "暂缓合并建议失败"
    });
  }
}
