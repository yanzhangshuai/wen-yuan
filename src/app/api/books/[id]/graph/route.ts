import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookGraph, type BookGraphSnapshot } from "@/server/modules/books/getBookGraph";
import { ERROR_CODES } from "@/types/api";

/** 图谱查询参数 Schema。 */
const graphQuerySchema = z.object({
  /** 截止章节号（可选，正整数）。 */
  chapter: z.coerce.number().int().positive("章节筛选参数不合法").optional()
});

/**
 * 功能：构造“书籍不存在”错误响应（图谱查询专用）。
 * 输入：requestId、startedAt、bookId。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/graph`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "书籍不存在",
      {
        type  : "NotFoundError",
        detail: `Book not found: ${bookId}`
      },
      meta
    ),
    404
  );
}

/**
 * GET `/api/books/:id/graph`
 * 功能：获取指定书籍的人物图谱快照（节点/边/统计）。
 * 入参：
 * - 路由参数：`id`（书籍 UUID）；
 * - 查询参数：`chapter`（可选，按章节截断图谱）。
 * 返回：`BookGraphSnapshot` 标准成功响应。
 */
export async function GET(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsedBook = await parseBookIdFromRoute(context, "/api/books/:id/graph", requestId, startedAt);
    if ("response" in parsedBook) {
      return parsedBook.response;
    }

    const url = new URL(request.url);
    const parsedQuery = graphQuerySchema.safeParse({
      chapter: url.searchParams.get("chapter") ?? undefined
    });
    if (!parsedQuery.success) {
      const meta = createApiMeta("/api/books/:id/graph", requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_BAD_REQUEST,
          "请求参数不合法",
          {
            type  : "ValidationError",
            detail: parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
          },
          meta
        ),
        400
      );
    }

    const data = await getBookGraph({
      bookId : parsedBook.bookId,
      chapter: parsedQuery.data.chapter
    });
    return okJson<BookGraphSnapshot>({
      path   : `/api/books/${parsedBook.bookId}/graph`,
      requestId,
      startedAt,
      code   : "BOOK_GRAPH_FETCHED",
      message: "图谱数据获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id/graph",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "图谱数据获取失败"
    });
  }
}
