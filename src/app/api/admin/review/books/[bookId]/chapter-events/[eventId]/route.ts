import { randomUUID } from "node:crypto";

import { z } from "zod";

import { BioCategory, ProcessingStatus } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  BiographyInputError,
  BiographyRecordNotFoundError
} from "@/server/modules/biography/errors";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { deleteEvent, updateEvent } from "@/server/modules/review/chapterEvents";
import { ERROR_CODES } from "@/types/api";

const paramsSchema = z.object({
  bookId : z.string().uuid("书籍 ID 不合法"),
  eventId: z.string().uuid("事迹 ID 不合法")
});

const bodySchema = z.object({
  personaId  : z.string().uuid("角色 ID 不合法").optional(),
  chapterId  : z.string().uuid("章节 ID 不合法").optional(),
  category   : z.nativeEnum(BioCategory).optional(),
  title      : z.string().trim().nullable().optional(),
  location   : z.string().trim().nullable().optional(),
  event      : z.string().trim().min(1, "事件内容不能为空").optional(),
  virtualYear: z.string().trim().nullable().optional(),
  tags       : z.array(z.string().trim().min(1)).max(12).optional(),
  ironyNote  : z.string().trim().nullable().optional(),
  status     : z.nativeEnum(ProcessingStatus).optional()
}).refine((data) => Object.keys(data).length > 0, {
  message: "至少需要一个可更新字段"
});

interface RouteContext {
  params: Promise<{ bookId: string; eventId: string }>;
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

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/review/books/:bookId/chapter-events/:eventId";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(path, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }
    const parsedBody = bodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(path, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await updateEvent(parsedParams.data.bookId, parsedParams.data.eventId, parsedBody.data);
    return okJson({
      path,
      requestId,
      startedAt,
      code   : "CHAPTER_EVENT_UPDATED",
      message: "角色事迹更新成功",
      data
    });
  } catch (error) {
    if (error instanceof BiographyRecordNotFoundError) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_NOT_FOUND,
          "传记记录不存在",
          { type: "NotFoundError", detail: `Biography record not found: ${error.biographyId}` },
          meta
        ),
        404
      );
    }
    if (error instanceof BiographyInputError) {
      return badRequestJson(path, requestId, startedAt, error.message);
    }
    if (error instanceof BookNotFoundError) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_NOT_FOUND,
          "书籍不存在",
          { type: "NotFoundError", detail: `Book not found: ${error.bookId}` },
          meta
        ),
        404
      );
    }
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "角色事迹更新失败"
    });
  }
}

export async function DELETE(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/review/books/:bookId/chapter-events/:eventId";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(path, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await deleteEvent(parsedParams.data.bookId, parsedParams.data.eventId);
    return okJson({
      path,
      requestId,
      startedAt,
      code   : "CHAPTER_EVENT_DELETED",
      message: "角色事迹删除成功",
      data
    });
  } catch (error) {
    if (error instanceof BiographyRecordNotFoundError) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_NOT_FOUND,
          "传记记录不存在",
          { type: "NotFoundError", detail: `Biography record not found: ${error.biographyId}` },
          meta
        ),
        404
      );
    }
    if (error instanceof BiographyInputError) {
      return badRequestJson(path, requestId, startedAt, error.message);
    }
    if (error instanceof BookNotFoundError) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_NOT_FOUND,
          "书籍不存在",
          { type: "NotFoundError", detail: `Book not found: ${error.bookId}` },
          meta
        ),
        404
      );
    }
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "角色事迹删除失败"
    });
  }
}
