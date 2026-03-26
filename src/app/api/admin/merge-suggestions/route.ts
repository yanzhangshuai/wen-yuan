import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listMergeSuggestions } from "@/server/modules/review/mergeSuggestions";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, mergeSuggestionQuerySchema } from "./_shared";

/**
 * GET `/api/admin/merge-suggestions`
 * 功能：查询合并建议队列（支持书籍与状态筛选）。
 * 入参：query `bookId/status`（可选）。
 * 返回：合并建议列表。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const parsedQuery = mergeSuggestionQuerySchema.safeParse({
      bookId: url.searchParams.get("bookId") ?? undefined,
      status: url.searchParams.get("status") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        "/api/admin/merge-suggestions",
        requestId,
        startedAt,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await listMergeSuggestions(parsedQuery.data);

    return okJson({
      path   : "/api/admin/merge-suggestions",
      requestId,
      startedAt,
      code   : "ADMIN_MERGE_SUGGESTIONS_LISTED",
      message: "合并建议列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/merge-suggestions",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "合并建议列表获取失败"
    });
  }
}
