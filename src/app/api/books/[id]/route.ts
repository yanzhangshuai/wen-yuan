import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { deleteBook, type DeleteBookResult } from "@/server/modules/books/deleteBook";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { getBookById } from "@/server/modules/books/getBookById";
import { type BookLibraryListItem } from "@/types/book";
import { ERROR_CODES } from "@/types/api";

function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}`, requestId, startedAt);
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
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await getBookById(parsed.bookId);
    return okJson<BookLibraryListItem>({
      path   : `/api/books/${parsed.bookId}`,
      requestId,
      startedAt,
      code   : "BOOK_FETCHED",
      message: "书籍详情获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍详情获取失败"
    });
  }
}

export async function DELETE(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await deleteBook(parsed.bookId);
    return okJson<DeleteBookResult>({
      path   : `/api/books/${parsed.bookId}`,
      requestId,
      startedAt,
      code   : "BOOK_DELETED",
      message: "书籍删除成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍删除失败"
    });
  }
}
