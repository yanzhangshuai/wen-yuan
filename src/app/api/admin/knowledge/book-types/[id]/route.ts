import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { getBookType, updateBookType, deleteBookType } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, uuidParamSchema, updateBookTypeSchema } from "../../_shared";

/**
 * GET `/api/admin/knowledge/book-types/:id`
 * 获取书籍类型详情。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson("/api/admin/knowledge/book-types/[id]", requestId, startedAt, "ID 不合法");
    }

    const data = await getBookType(parsedParams.data.id);
    if (!data) {
      return notFoundJson("/api/admin/knowledge/book-types/[id]", requestId, startedAt, "书籍类型不存在");
    }

    return okJson({
      path   : `/api/admin/knowledge/book-types/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_TYPE_DETAIL",
      message: "书籍类型详情获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/book-types/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍类型详情获取失败"
    });
  }
}

/**
 * PATCH `/api/admin/knowledge/book-types/:id`
 * 更新书籍类型。
 */
export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson("/api/admin/knowledge/book-types/[id]", requestId, startedAt, "ID 不合法");
    }

    const parsedBody = updateBookTypeSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/book-types/${parsedParams.data.id}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateBookType(parsedParams.data.id, parsedBody.data);

    return okJson({
      path   : `/api/admin/knowledge/book-types/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_TYPE_UPDATED",
      message: "书籍类型更新成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/book-types/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍类型更新失败"
    });
  }
}

/**
 * DELETE `/api/admin/knowledge/book-types/:id`
 * 删除书籍类型。
 */
export async function DELETE(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = uuidParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson("/api/admin/knowledge/book-types/[id]", requestId, startedAt, "ID 不合法");
    }

    await deleteBookType(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/knowledge/book-types/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_TYPE_DELETED",
      message: "书籍类型删除成功",
      data   : null
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/book-types/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍类型删除失败"
    });
  }
}
