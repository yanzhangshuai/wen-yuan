import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BioCategory, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BiographyInputError } from "@/server/modules/biography/errors";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  createManualEvent,
  listChapterSummaries,
  listEvents,
  type ChapterEventItem
} from "@/server/modules/review/chapterEvents";
import { ERROR_CODES } from "@/types/api";

const routeParamsSchema = z.object({
  bookId: z.string().uuid("书籍 ID 不合法")
});

const querySchema = z.object({
  chapterId: z.string().uuid("章节 ID 不合法").optional(),
  status   : z.nativeEnum(ProcessingStatus).optional(),
  source   : z.nativeEnum(RecordSource).optional()
});

const createEventSchema = z.object({
  personaId  : z.string().uuid("角色 ID 不合法"),
  chapterId  : z.string().uuid("章节 ID 不合法"),
  category   : z.nativeEnum(BioCategory).optional(),
  title      : z.string().trim().nullable().optional(),
  location   : z.string().trim().nullable().optional(),
  event      : z.string().trim().min(1, "事件内容不能为空"),
  virtualYear: z.string().trim().nullable().optional(),
  tags       : z.array(z.string().trim().min(1)).max(12).optional(),
  ironyNote  : z.string().trim().nullable().optional()
});

interface RouteContext {
  params: Promise<{ bookId: string }>;
}

function badRequestJson(path: string, requestId: string, startedAt: number, detail: string) {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      "请求参数不合法",
      { type: "ValidationError", detail },
      meta
    ),
    400
  );
}

function notFoundJson(path: string, requestId: string, startedAt: number, detail: string) {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "资源不存在",
      { type: "NotFoundError", detail },
      meta
    ),
    404
  );
}

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const url = new URL(request.url);
  const path = "/api/admin/review/books/:bookId/chapter-events";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(path, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }

    const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsedQuery.success) {
      return badRequestJson(path, requestId, startedAt, parsedQuery.error.issues[0]?.message ?? "请求参数不合法");
    }

    if (parsedQuery.data.chapterId) {
      const events = await listEvents(parsedParams.data.bookId, parsedQuery.data.chapterId, {
        status: parsedQuery.data.status,
        source: parsedQuery.data.source
      });
      return okJson<ChapterEventItem[]>({
        path   : url.pathname,
        requestId,
        startedAt,
        code   : "CHAPTER_EVENTS_FETCHED",
        message: "章节角色事迹获取成功",
        data   : events
      });
    }

    const data = await listChapterSummaries(parsedParams.data.bookId);
    return okJson({
      path   : url.pathname,
      requestId,
      startedAt,
      code   : "CHAPTER_EVENT_CHAPTERS_FETCHED",
      message: "章节事迹摘要获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(path, requestId, startedAt, `Book not found: ${error.bookId}`);
    }
    if (error instanceof BiographyInputError) {
      return badRequestJson(path, requestId, startedAt, error.message);
    }
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "章节事迹查询失败"
    });
  }
}

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/review/books/:bookId/chapter-events";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(path, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }

    const parsedBody = createEventSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(path, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await createManualEvent(parsedParams.data.bookId, parsedBody.data);
    return okJson({
      path,
      requestId,
      startedAt,
      code   : "CHAPTER_EVENT_CREATED",
      message: "角色事迹创建成功",
      data,
      status : 201
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(path, requestId, startedAt, `Book not found: ${error.bookId}`);
    }
    if (error instanceof BiographyInputError) {
      return badRequestJson(path, requestId, startedAt, error.message);
    }
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "角色事迹创建失败"
    });
  }
}
