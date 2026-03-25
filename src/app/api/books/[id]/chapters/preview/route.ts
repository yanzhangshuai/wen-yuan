import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  BookNotFoundError,
  BookRawContentMissingError,
  getChapterPreview,
  type ChapterPreviewResult
} from "@/server/modules/books/getChapterPreview";
import { ERROR_CODES } from "@/types/api";

function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/chapters/preview`, requestId, startedAt);
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

function badRequestJson(
  requestId: string,
  startedAt: number,
  bookId: string,
  detail: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/chapters/preview`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "章节预览失败",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id/chapters/preview", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await getChapterPreview(parsed.bookId);
    return okJson<ChapterPreviewResult>({
      path   : `/api/books/${parsed.bookId}/chapters/preview`,
      requestId,
      startedAt,
      code   : "BOOK_CHAPTERS_PREVIEWED",
      message: "章节切分预览成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    if (error instanceof BookRawContentMissingError) {
      return badRequestJson(requestId, startedAt, error.bookId, "书籍原文为空，无法生成章节预览");
    }

    return failJson({
      path           : "/api/books/:id/chapters/preview",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "章节切分预览失败"
    });
  }
}

