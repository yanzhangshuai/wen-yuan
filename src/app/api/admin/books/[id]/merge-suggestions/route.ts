import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { ERROR_CODES } from "@/types/api";

import { retiredLegacyReviewStackJson } from "../../../_shared/retired-legacy-review-stack";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：书籍审核中心合并建议列表）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/books/[id]/merge-suggestions/route.ts`
 *
 * T20 之后该路径只作为旧 review-center 的退役边界保留：
 * - 管理员鉴权仍然生效；
 * - 通过鉴权后统一返回 410；
 * - 调用方应跳转到新的 `/admin/review/[bookId]` 工作台。
 * =============================================================================
 */

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/merge-suggestions";

  try {
    // 管理员鉴权：合并建议列表涉及人物原始归并线索，不能暴露给 viewer。
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
      fallbackMessage: "书籍合并建议列表获取失败"
    });
  }
}
