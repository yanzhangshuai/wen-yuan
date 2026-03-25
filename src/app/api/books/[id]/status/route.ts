import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError, getBookStatus, type BookStatusSnapshot } from "@/server/modules/books/getBookStatus";
import { ERROR_CODES } from "@/types/api";

function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/status`, requestId, startedAt);
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

export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id/status", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await getBookStatus(parsed.bookId);

    return okJson<BookStatusSnapshot>({
      path   : `/api/books/${parsed.bookId}/status`,
      requestId,
      startedAt,
      code   : "BOOK_STATUS_FETCHED",
      message: "书籍状态获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id/status",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍状态获取失败"
    });
  }
}
