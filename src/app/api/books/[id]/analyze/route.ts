import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import {
  ANALYSIS_SCOPE_VALUES,
  AnalysisModelDisabledError,
  AnalysisModelNotFoundError,
  AnalysisScopeInvalidError,
  BookNotFoundError,
  startBookAnalysis,
  type StartBookAnalysisResult
} from "@/server/modules/books/startBookAnalysis";
import { ERROR_CODES } from "@/types/api";

const startAnalysisBodySchema = z.object({
  aiModelId   : z.string().uuid("模型 ID 不合法").nullable().optional(),
  scope       : z.enum(ANALYSIS_SCOPE_VALUES).optional(),
  chapterStart: z.number().int().positive().nullable().optional(),
  chapterEnd  : z.number().int().positive().nullable().optional()
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  path: string,
  detail: string
) {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "请求参数不合法",
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}

function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/analyze`, requestId, startedAt);
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

export async function POST(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/analyze";

  try {
    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    const requestJson = await request.json().catch(() => ({}));
    const parsedBody = startAnalysisBodySchema.safeParse(requestJson);
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await startBookAnalysis(parsedRoute.bookId, parsedBody.data);
    return okJson<StartBookAnalysisResult>({
      path   : `/api/books/${parsedRoute.bookId}/analyze`,
      requestId,
      startedAt,
      code   : "BOOK_ANALYSIS_STARTED",
      message: "解析任务已创建",
      data,
      status : 202
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    if (
      error instanceof AnalysisModelNotFoundError
      || error instanceof AnalysisModelDisabledError
      || error instanceof AnalysisScopeInvalidError
    ) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        error.message
      );
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "启动解析失败"
    });
  }
}

