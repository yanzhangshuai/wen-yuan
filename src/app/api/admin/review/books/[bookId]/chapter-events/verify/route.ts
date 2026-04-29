import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BiographyInputError } from "@/server/modules/biography/errors";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { markChapterVerified } from "@/server/modules/review/chapterEvents";
import { ERROR_CODES } from "@/types/api";

const paramsSchema = z.object({
  bookId: z.string().uuid("书籍 ID 不合法")
});

const bodySchema = z.object({
  chapterId : z.string().uuid("章节 ID 不合法"),
  verifiedBy: z.string().uuid("校验人 ID 不合法").optional()
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

export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/review/books/:bookId/chapter-events/verify";

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

    const data = await markChapterVerified(
      parsedParams.data.bookId,
      parsedBody.data.chapterId,
      parsedBody.data.verifiedBy
    );
    return okJson({
      path,
      requestId,
      startedAt,
      code   : "CHAPTER_EVENTS_VERIFIED",
      message: "章节角色事迹已校验",
      data
    });
  } catch (error) {
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
      fallbackMessage: "章节校验失败"
    });
  }
}
