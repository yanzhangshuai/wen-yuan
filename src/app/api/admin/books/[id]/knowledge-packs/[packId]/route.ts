import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { BookNotFoundError } from "@/server/modules/books/errors";
import {
  BookKnowledgePackRelationNotFoundError,
  unmountKnowledgePack,
  updateBookKnowledgePackPriority
} from "@/server/modules/knowledge/book-knowledge-packs";
import { ERROR_CODES } from "@/types/api";

import {
  badRequestJson,
  bookKnowledgePackRouteParamsSchema,
  notFoundJson,
  updateBookKnowledgePackPriorityBodySchema
} from "../../../knowledge-packs/_shared";

export async function PUT(
  request: Request,
  context: { params: Promise<{ id: string; packId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/knowledge-packs/[packId]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookKnowledgePackRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateBookKnowledgePackPriorityBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/books/${parsedParams.data.id}/knowledge-packs/${parsedParams.data.packId}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateBookKnowledgePackPriority(
      parsedParams.data.id,
      parsedParams.data.packId,
      parsedBody.data.priority
    );

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/knowledge-packs/${parsedParams.data.packId}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACK_PRIORITY_UPDATED",
      message: "知识包优先级已更新",
      data
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/knowledge-packs/${await readPackId(context)}`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    if (error instanceof BookKnowledgePackRelationNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/knowledge-packs/${error.packId}`,
        requestId,
        startedAt,
        "书籍未挂载该知识包",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包优先级更新失败"
    });
  }
}

export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string; packId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/admin/books/[id]/knowledge-packs/[packId]";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookKnowledgePackRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        routePath,
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    await unmountKnowledgePack(parsedParams.data.id, parsedParams.data.packId);

    return okJson({
      path   : `/api/admin/books/${parsedParams.data.id}/knowledge-packs/${parsedParams.data.packId}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACK_UNMOUNTED",
      message: "知识包已移除",
      data   : null
    });
  } catch (error) {
    if (error instanceof BookNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/knowledge-packs/${await readPackId(context)}`,
        requestId,
        startedAt,
        "书籍不存在",
        error.message
      );
    }

    if (error instanceof BookKnowledgePackRelationNotFoundError) {
      return notFoundJson(
        `/api/admin/books/${error.bookId}/knowledge-packs/${error.packId}`,
        requestId,
        startedAt,
        "书籍未挂载该知识包",
        error.message
      );
    }

    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包移除失败"
    });
  }
}

async function readPackId(context: { params: Promise<{ id: string; packId: string }> }) {
  const params = await context.params;
  return params.packId;
}
