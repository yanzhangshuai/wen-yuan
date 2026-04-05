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
 * 文件定位（Next.js Route Handler / 章节预览接口）：
 * - 该 `route.ts` 由 App Router 自动注册为 `/api/books/:id/chapters/preview`。
 * - 职责是把服务层 `getChapterPreview` 能力包装成统一 API contract，并处理业务异常映射。
 */

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
  // 使用统一 meta 保持前后端错误排查链路一致。
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
  // 400 仅用于“请求在业务上不可执行”，如缺失源文件。
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
    // 先复用共享参数解析器，统一 bookId 校验与错误响应形态。
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id/chapters/preview", requestId, startedAt);
    if ("response" in parsed) {
      // 共享解析器已经产出完整错误响应时，直接短路返回。
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
      // 源文件缺失属于“当前请求不可执行”，按 400 返回可指导调用方修复输入状态。
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
