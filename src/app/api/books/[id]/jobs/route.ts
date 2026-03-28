import { randomUUID } from "node:crypto";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError, listBookAnalysisJobs, type AnalysisJobListItem } from "@/server/modules/analysis/jobs/listBookAnalysisJobs";
import { ERROR_CODES } from "@/types/api";

function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/jobs`, requestId, startedAt);
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
 * GET `/api/books/:id/jobs`
 * 功能：获取指定书籍的所有解析任务记录（按创建时间降序）。
 * 入参：`context.params.id` 书籍 ID（UUID）。
 * 返回：`AnalysisJobListItem[]` 标准成功响应。
 */
export async function GET(
  _request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const parsed = await parseBookIdFromRoute(context, "/api/books/:id/jobs", requestId, startedAt);
    if ("response" in parsed) {
      return parsed.response;
    }

    const data = await listBookAnalysisJobs(parsed.bookId);

    return okJson<AnalysisJobListItem[]>({
      path   : `/api/books/${parsed.bookId}/jobs`,
      requestId,
      startedAt,
      code   : "BOOK_JOBS_FETCHED",
      message: "解析任务列表获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path           : "/api/books/:id/jobs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "解析任务列表获取失败"
    });
  }
}
