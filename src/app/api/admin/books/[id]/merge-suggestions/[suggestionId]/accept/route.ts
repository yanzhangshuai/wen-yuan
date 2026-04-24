import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { retiredLegacyReviewStackJson } from "../../../../../_shared/retired-legacy-review-stack";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：审核中心·接受合并建议）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/books/[id]/merge-suggestions/[suggestionId]/accept/route.ts`
 *
 * 路由语义：
 * - `POST /api/admin/books/:id/merge-suggestions/:suggestionId/accept`
 *
 * T20 之后该路径只作为旧 review-center 的退役边界保留：
 * - 管理员鉴权仍然生效；
 * - 通过鉴权后统一返回 410；
 * - 旧 accept 写路径不再允许被触发。
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
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);
    const { id } = await context.params;
    return retiredLegacyReviewStackJson({
      path           : routePath,
      requestId,
      startedAt,
      replacementPath: `/admin/review/${id}`
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
