import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { ChapterType } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  BookNotFoundError,
  BookRawContentMissingError,
  ChapterConfirmPayloadError,
  confirmBookChapters,
  type ConfirmBookChaptersResult
} from "@/server/modules/books/confirmBookChapters";
import { ERROR_CODES } from "@/types/api";

/**
 * 功能：章节确认请求体校验。
 * 输入字段：
 * - `items: Array<{ index: number; chapterType: ChapterType; title: string; content?: string | null }>`
 * - `index` 为章节序号（正整数），`chapterType` 为章节枚举，`title` 为章节标题。
 * - `content` 可选，允许手动覆盖自动切分得到的正文内容。
 * 输出：可安全传给 `confirmBookChapters` 的章节数组。
 * 异常：无（校验失败由路由返回 400）。
 * 副作用：无。
 */
const chapterConfirmBodySchema = z.object({
  items: z.array(
    z.object({
      index      : z.number().int().positive("章节序号必须为正整数"),
      chapterType: z.nativeEnum(ChapterType),
      title      : z.string().trim().min(1, "章节标题不能为空"),
      content    : z.string().optional().nullable()
    })
  ).min(1, "至少需要确认一个章节")
});

function badRequestJson(
  requestId: string,
  startedAt: number,
  bookId: string,
  detail: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/chapters/confirm`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "章节确认失败",
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
  const meta = createApiMeta(`/api/books/${bookId}/chapters/confirm`, requestId, startedAt);
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
 * 功能：确认并落库一本书的章节切分结果。
 * 输入：管理员身份 + 路由参数 `bookId` + 章节确认数组。
 * 输出：统一成功响应，包含已确认章节总数与章节明细。
 * 异常：参数错误 400；书籍不存在 404；其余失败 500。
 * 副作用：删除旧章节并写入新的章节记录。
 */
export async function POST(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/chapters/confirm";
  let routeBookId = ":id";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }
    routeBookId = parsedRoute.bookId;

    const parsedBody = chapterConfirmBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedRoute.bookId,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await confirmBookChapters(parsedRoute.bookId, parsedBody.data.items);
    return okJson<ConfirmBookChaptersResult>({
      path   : `/api/books/${parsedRoute.bookId}/chapters/confirm`,
      requestId,
      startedAt,
      code   : "BOOK_CHAPTERS_CONFIRMED",
      message: "章节确认成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId);
    }

    if (error instanceof BookRawContentMissingError) {
      return badRequestJson(requestId, startedAt, error.bookId, error.message);
    }

    if (error instanceof ChapterConfirmPayloadError) {
      return badRequestJson(requestId, startedAt, routeBookId, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "章节确认失败"
    });
  }
}
