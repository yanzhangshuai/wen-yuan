import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { listBookKnowledgePacks, mountKnowledgePack } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import {
  badRequestJson,
  bookKnowledgeRouteParamsSchema,
  mountBookKnowledgePackBodySchema,
  notFoundJson
} from "../../knowledge-packs/_shared";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/knowledge-packs";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookKnowledgeRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await listBookKnowledgePacks(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/knowledge-packs`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACKS_FETCHED",
      message: "书籍知识包获取成功",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/knowledge-packs`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍知识包获取失败"
    });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/knowledge-packs";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookKnowledgeRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = mountBookKnowledgePackBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/books/${parsedParams.data.id}/knowledge-packs`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await mountKnowledgePack({
      bookId: parsedParams.data.id,
      ...parsedBody.data
    });

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/knowledge-packs`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACK_MOUNTED",
      message: "知识包挂载成功",
      data,
      status : 201
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/knowledge-packs`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包挂载失败"
    });
  }
}
