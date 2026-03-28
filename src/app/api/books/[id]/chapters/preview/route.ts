import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  BookNotFoundError,
  BookSourceFileMissingError,
  getChapterPreview,
  type ChapterPreviewResult
} from "@/server/modules/books/getChapterPreview";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：构造“书籍不存在”错误响应（章节预览专用）。
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

/**
 * 功能：构造“章节预览请求不合法”错误响应。
 * 输入：requestId、startedAt、bookId、错误详情。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
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

/**
 * GET `/api/books/:id/chapters/preview`
 * 功能：读取书籍已落库章节并返回预览。
 * 入参：`context.params.id`（书籍 UUID）。
 * 返回：`ChapterPreviewResult` 标准成功响应。
 */
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

    if (error instanceof BookSourceFileMissingError) {
      return badRequestJson(requestId, startedAt, error.bookId, "书籍源文件不存在，无法生成章节预览");
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
