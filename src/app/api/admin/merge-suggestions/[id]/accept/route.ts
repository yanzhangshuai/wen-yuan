import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { retiredLegacyReviewStackJson } from "../../../_shared/retired-legacy-review-stack";

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
 * T20 之后该路径只作为退役边界保留：
 * - 管理员鉴权仍然生效；
 * - 通过鉴权后统一返回 410；
 * - 旧 accept 写路径不再允许被触发。
 * =============================================================================
 */

/**
 * POST `/api/admin/merge-suggestions/:id/accept`
 * 功能：返回旧 accept 路径的退役提示。
 */
export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/merge-suggestions/[id]/accept";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);
    await context.params;
    return retiredLegacyReviewStackJson({
      path           : routePath,
      requestId,
      startedAt,
      replacementPath: "/admin/review"
    });
  } catch (error) {
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
