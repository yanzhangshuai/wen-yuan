import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson, parsePagination } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listBookSuggestionsByTab } from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import {
  reviewCenterBadRequestJson,
  reviewCenterBookParamsSchema,
  reviewCenterListQuerySchema
} from "./_shared";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：书籍审核中心合并建议列表）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/admin/books/[id]/merge-suggestions/route.ts`
 *
 * 路由语义：
 * - `GET /api/admin/books/:id/merge-suggestions?tab=merge|impersonation|done&page=X`
 * - 以 Tab 语义区分三类队列，而不是让前端自行过滤 source/status；
 *   理由是 Tab -> 条件映射属于"审核中心契约"，收敛在服务层更稳定。
 *
 * 与 `/api/admin/merge-suggestions`（全局）的区别：
 * - 本接口按书籍聚合，路径天然锁定 `bookId`，无需 query 传；
 * - 本接口支持 Tab 语义；全局接口只支持 status 过滤；
 * - 审核中心页调用本接口；知识库列表等全局入口调用全局接口。
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

    const parsedParams = reviewCenterBookParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return reviewCenterBadRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const url = new URL(request.url);
    const parsedQuery = reviewCenterListQuerySchema.safeParse({
      tab: url.searchParams.get("tab") ?? undefined
    });
    if (!parsedQuery.success) {
      return reviewCenterBadRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const { page, pageSize } = parsePagination(url.searchParams);

    const { items, total } = await listBookSuggestionsByTab({
      bookId: parsedParams.data.id,
      tab   : parsedQuery.data.tab,
      page,
      pageSize
    });

    return okJson({
      path      : routePath,
      requestId,
      startedAt,
      code      : "ADMIN_BOOK_MERGE_SUGGESTIONS_LISTED",
      message   : "书籍合并建议列表获取成功",
      data      : items,
      pagination: {
        page,
        pageSize,
        total
      }
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
