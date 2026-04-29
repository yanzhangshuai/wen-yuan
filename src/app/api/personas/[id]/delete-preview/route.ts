import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { previewDeletePersona, type DeletePersonaPreview } from "@/server/modules/personas/deletePersona";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { ERROR_CODES } from "@/types/api";

const paramsSchema = z.object({
  id: z.string().uuid("人物 ID 不合法")
});

const querySchema = z.object({
  bookId: z.string().uuid("书籍 ID 不合法").optional()
});

interface RouteContext {
  params: Promise<{ id: string }>;
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

export async function GET(request: Request, context: RouteContext): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const url = new URL(request.url);
  const path = "/api/personas/:id/delete-preview";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedParams = paramsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(path, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "请求参数不合法");
    }
    const parsedQuery = querySchema.safeParse(Object.fromEntries(url.searchParams));
    if (!parsedQuery.success) {
      return badRequestJson(path, requestId, startedAt, parsedQuery.error.issues[0]?.message ?? "请求参数不合法");
    }

    const data = await previewDeletePersona(parsedParams.data.id, parsedQuery.data);
    return okJson<DeletePersonaPreview>({
      path   : url.pathname,
      requestId,
      startedAt,
      code   : "PERSONA_DELETE_PREVIEW_FETCHED",
      message: "人物删除影响预览获取成功",
      data
    });
  } catch (error) {
    if (error instanceof PersonaNotFoundError) {
      const meta = createApiMeta(path, requestId, startedAt);
      return toNextJson(
        errorResponse(
          ERROR_CODES.COMMON_NOT_FOUND,
          "人物不存在",
          { type: "NotFoundError", detail: `Persona not found: ${error.personaId}` },
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
      fallbackMessage: "人物删除影响预览获取失败"
    });
  }
}
