import { randomUUID } from "node:crypto";

import { z } from "zod";

import { parseBookIdFromRoute, type BookRouteParamsContext } from "@/app/api/books/[id]/_shared";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import {
  createBookRelationship,
  type CreateBookRelationshipResult
} from "@/server/modules/relationships/createBookRelationship";
import {
  listBookRelationships,
  type BookRelationshipListItem
} from "@/server/modules/relationships/listBookRelationships";
import { RelationshipInputError } from "@/server/modules/relationships/errors";
import { ERROR_CODES } from "@/types/api";

/**
 * 查询参数校验：关系列表筛选条件。
 */
const relationshipQuerySchema = z.object({
  type  : z.string().trim().min(1, "关系类型不能为空").optional(),
  status: z.nativeEnum(ProcessingStatus).optional(),
  source: z.nativeEnum(RecordSource).optional()
});

/**
 * 创建关系请求体校验。
 */
const createRelationshipBodySchema = z.object({
  chapterId  : z.string().uuid("章节 ID 不合法"),
  sourceId   : z.string().uuid("起点人物 ID 不合法"),
  targetId   : z.string().uuid("终点人物 ID 不合法"),
  type       : z.string().trim().min(1, "关系类型不能为空"),
  weight     : z.number().positive("关系权重必须大于 0").optional(),
  description: z.string().trim().nullable().optional(),
  evidence   : z.string().trim().nullable().optional(),
  confidence : z.number().min(0, "置信度不能小于 0").max(1, "置信度不能大于 1").optional()
});

/**
 * 构造「书籍不存在」统一响应。
 */
function notFoundBookJson(requestId: string, startedAt: number, bookId: string): Response {
  const meta = createApiMeta(`/api/books/${bookId}/relationships`, requestId, startedAt);
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
 * 构造「人物不存在」统一响应。
 */
function notFoundPersonaJson(requestId: string, startedAt: number, personaId: string): Response {
  const meta = createApiMeta("/api/books/:id/relationships", requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_NOT_FOUND,
      "人物不存在",
      {
        type  : "NotFoundError",
        detail: `Persona not found: ${personaId}`
      },
      meta
    ),
    404
  );
}

/**
 * 构造参数错误统一响应。
 */
function badRequestJson(requestId: string, startedAt: number, path: string, detail: string): Response {
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

/**
 * 功能：读取书籍关系列表。
 * 输入：`bookId` 路由参数 + 可选查询参数 `type/status/source`。
 * 输出：统一 API 成功响应，`data` 为关系列表。
 * 异常：参数错误返回 400；书籍不存在返回 404；其余返回 500。
 * 副作用：无（只读接口）。
 */
export async function GET(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/relationships";

  try {
    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    const url = new URL(request.url);
    const parsedQuery = relationshipQuerySchema.safeParse({
      type  : url.searchParams.get("type") ?? undefined,
      status: url.searchParams.get("status") ?? undefined,
      source: url.searchParams.get("source") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedQuery.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await listBookRelationships(parsedRoute.bookId, parsedQuery.data);
    return okJson<BookRelationshipListItem[]>({
      path   : `/api/books/${parsedRoute.bookId}/relationships`,
      requestId,
      startedAt,
      code   : "BOOK_RELATIONSHIPS_FETCHED",
      message: "关系列表获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundBookJson(requestId, startedAt, error.bookId);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "关系列表获取失败"
    });
  }
}

/**
 * 功能：手动新增关系。
 * 输入：`bookId` 路由参数 + JSON body（章节、起止人物、类型等）。
 * 输出：统一 API 成功响应（201），`data` 为新建关系快照。
 * 异常：参数错误返回 400；书籍/人物不存在返回 404；其余返回 500。
 * 副作用：要求管理员权限，向 `relationship` 写入 `MANUAL + VERIFIED` 记录。
 */
export async function POST(
  request: Request,
  context: BookRouteParamsContext
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/books/:id/relationships";

  try {
    const auth = await getAuthContext(request.headers);
    requireAdmin(auth);

    const parsedRoute = await parseBookIdFromRoute(context, path, requestId, startedAt);
    if ("response" in parsedRoute) {
      return parsedRoute.response;
    }

    const parsedBody = createRelationshipBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        requestId,
        startedAt,
        path,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createBookRelationship(parsedRoute.bookId, parsedBody.data);
    return okJson<CreateBookRelationshipResult>({
      path   : `/api/books/${parsedRoute.bookId}/relationships`,
      requestId,
      startedAt,
      code   : "BOOK_RELATIONSHIP_CREATED",
      message: "关系创建成功",
      data,
      status : 201
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundBookJson(requestId, startedAt, error.bookId);
    }
    if (error instanceof PersonaNotFoundError) {
      return notFoundPersonaJson(requestId, startedAt, error.personaId);
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
      fallbackMessage: "关系创建失败"
    });
  }
}
