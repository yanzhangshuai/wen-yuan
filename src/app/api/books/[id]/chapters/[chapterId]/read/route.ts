import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  ChapterNotFoundError,
  ParaIndexOutOfRangeError,
  readChapter,
  type ChapterReadSnapshot
} from "@/server/modules/books/readChapter";
import { ERROR_CODES } from "@/types/api";

/** 章节阅读路由参数 Schema。 */
const chapterReadRouteParamsSchema = z.object({
  /** 书籍 ID（UUID）。 */
  id       : z.string().uuid("书籍 ID 不合法"),
  /** 章节 ID（UUID）。 */
  chapterId: z.string().uuid("章节 ID 不合法")
});

/** 章节阅读查询参数 Schema。 */
const chapterReadQuerySchema = z.object({
  /** 高亮定位的段落索引（从 0 开始，可选）。 */
  paraIndex: z.coerce.number().int().nonnegative("段落索引不合法").optional(),
  /** 关键字高亮文本（可选）。 */
  highlight: z.string().trim().min(1, "高亮关键词不能为空").optional()
});

/** 章节阅读路由上下文。 */
interface ChapterReadRouteContext {
  /** 动态参数 Promise，resolve 后包含 `{ id, chapterId }`。 */
  params: Promise<{ id: string; chapterId: string }>;
}

/**
 * 功能：构造章节阅读“资源不存在”错误响应。
 * 输入：requestId、startedAt、bookId、chapterId。
 * 输出：HTTP 404 响应。
 * 异常：无。
 * 副作用：无。
 */
function notFoundJson(
  requestId: string,
  startedAt: number,
  bookId: string,
  chapterId: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/chapters/${chapterId}/read`, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "资源不存在",
      {
        type  : "NotFoundError",
        detail: `bookId=${bookId}, chapterId=${chapterId}`
      },
      meta
    ),
    404
  );
}

/**
 * 功能：构造章节阅读“请求参数不合法”错误响应。
 * 输入：requestId、startedAt、bookId、chapterId、错误详情。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
function badRequestJson(
  requestId: string,
  startedAt: number,
  bookId: string,
  chapterId: string,
  detail: string
) {
  const meta = createApiMeta(`/api/books/${bookId}/chapters/${chapterId}/read`, requestId, startedAt);
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

/**
 * GET `/api/books/:id/chapters/:chapterId/read`
 * 功能：读取章节原文并支持“按段定位 + 关键字高亮”。
 * 入参：
 * - 路由参数：`id`（书籍 UUID）、`chapterId`（章节 UUID）；
 * - 查询参数：`paraIndex`（可选）、`highlight`（可选）。
 * 返回：`ChapterReadSnapshot` 标准成功响应。
 */
export async function GET(
  request: Request,
  context: ChapterReadRouteContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/chapters/:chapterId/read";

  try {
    const params = await context.params;
    const parsedParams = chapterReadRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        params.id ?? ":id",
        params.chapterId ?? ":chapterId",
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const url = new URL(request.url);
    const parsedQuery = chapterReadQuerySchema.safeParse({
      paraIndex: url.searchParams.get("paraIndex") ?? undefined,
      highlight: url.searchParams.get("highlight") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        requestId,
        startedAt,
        parsedParams.data.id,
        parsedParams.data.chapterId,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await readChapter({
      bookId   : parsedParams.data.id,
      chapterId: parsedParams.data.chapterId,
      paraIndex: parsedQuery.data.paraIndex,
      highlight: parsedQuery.data.highlight
    });

    return okJson<ChapterReadSnapshot>({
      path   : `/api/books/${parsedParams.data.id}/chapters/${parsedParams.data.chapterId}/read`,
      requestId,
      startedAt,
      code   : "BOOK_CHAPTER_READ",
      message: "原文读取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId, ":chapterId");
    }

    if (error instanceof ChapterNotFoundError) {
      return notFoundJson(requestId, startedAt, error.bookId, error.chapterId);
    }

    if (error instanceof ParaIndexOutOfRangeError) {
      return badRequestJson(
        requestId,
        startedAt,
        ":id",
        ":chapterId",
        `段落索引越界，允许范围 0-${error.maxIndex}`
      );
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "原文读取失败"
    });
  }
}
