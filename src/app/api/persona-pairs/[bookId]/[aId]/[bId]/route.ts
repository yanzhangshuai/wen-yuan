/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：两人物关系聚合查询）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/app/api/persona-pairs/[bookId]/[aId]/[bId]/route.ts`
 *
 * 路由职责：
 * - `GET /api/persona-pairs/:bookId/:aId/:bId`：读取两个人物之间的结构关系和关系事件；
 * - 负责登录态校验、路径参数校验与领域错误到 HTTP 响应的映射。
 * =============================================================================
 */
import { randomUUID } from "node:crypto";

import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { failJson, okJson } from "@/server/http/route-utils";
import { AuthError, getAuthContext } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";
import { getPersonaPair } from "@/server/modules/relationships/getPersonaPair";
import { ERROR_CODES } from "@/types/api";
import type { PersonaPairResponse } from "@/types/persona-pair";

interface PersonaPairRouteParamsContext {
  params: Promise<{
    bookId: string;
    aId   : string;
    bId   : string;
  }>;
}

const personaPairRouteParamsSchema = z.object({
  bookId: z.string().uuid("书籍 ID 不合法"),
  aId   : z.string().uuid("起点人物 ID 不合法"),
  bId   : z.string().uuid("终点人物 ID 不合法")
});

function badRequestJson(requestId: string, startedAt: number, path: string, detail: string): Response {
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

function notFoundJson(requestId: string, startedAt: number, path: string, detail: string): Response {
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

export async function GET(
  request: Request,
  context: PersonaPairRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/persona-pairs/:bookId/:aId/:bId";

  try {
    const auth = await getAuthContext(request.headers);
    if (!auth.isAuthenticated) {
      throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "请先登录");
    }

    const params = await context.params;
    const parsedParams = personaPairRouteParamsSchema.safeParse(params);
    if (!parsedParams.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    if (parsedParams.data.aId === parsedParams.data.bId) {
      return badRequestJson(requestId, startedAt, path, "起点和终点不能相同");
    }

    const data = await getPersonaPair(parsedParams.data);
    return okJson<PersonaPairResponse>({
      path   : `/api/persona-pairs/${parsedParams.data.bookId}/${parsedParams.data.aId}/${parsedParams.data.bId}`,
      requestId,
      startedAt,
      code   : "PERSONA_PAIR_FETCHED",
      message: "人物关系聚合获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(requestId, startedAt, path, `Book not found: ${error.bookId}`);
    }
    if (error instanceof PersonaNotFoundError) {
      return notFoundJson(requestId, startedAt, path, `Persona not found: ${error.personaId}`);
    }
    if (error instanceof RelationshipInputError) {
      return badRequestJson(requestId, startedAt, path, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "人物关系聚合获取失败"
    });
  }
}
