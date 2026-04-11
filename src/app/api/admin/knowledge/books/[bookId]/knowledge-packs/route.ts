import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listBookKnowledgePacks, mountKnowledgePack, unmountKnowledgePack } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { z } from "zod";

const bookIdParamSchema = z.object({
  bookId: z.string().uuid("书籍 ID 不合法")
});

const mountSchema = z.object({
  packId  : z.string().uuid("知识包 ID 不合法"),
  priority: z.number().int().default(0)
});

const unmountSchema = z.object({
  packId: z.string().uuid("知识包 ID 不合法")
});

/**
 * GET `/api/admin/knowledge/books/:bookId/knowledge-packs`
 * 获取书籍关联的知识包。
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ bookId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookIdParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return failJson({
        path           : "/api/admin/knowledge/books/[bookId]/knowledge-packs", requestId, startedAt,
        error          : new Error("书籍 ID 不合法"), fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST, fallbackMessage: "书籍 ID 不合法"
      });
    }

    const data = await listBookKnowledgePacks(parsedParams.data.bookId);

    return okJson({
      path   : `/api/admin/knowledge/books/${parsedParams.data.bookId}/knowledge-packs`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACKS_LISTED",
      message: "书籍知识包获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/books/[bookId]/knowledge-packs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍知识包获取失败"
    });
  }
}

/**
 * POST `/api/admin/knowledge/books/:bookId/knowledge-packs`
 * 挂载知识包到书籍。
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ bookId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookIdParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return failJson({
        path           : "/api/admin/knowledge/books/[bookId]/knowledge-packs", requestId, startedAt,
        error          : new Error("书籍 ID 不合法"), fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST, fallbackMessage: "书籍 ID 不合法"
      });
    }

    const parsedBody = mountSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return failJson({
        path           : `/api/admin/knowledge/books/${parsedParams.data.bookId}/knowledge-packs`, requestId, startedAt,
        error          : new Error(parsedBody.error.issues[0]?.message ?? "请求参数不合法"),
        fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST, fallbackMessage: "请求参数不合法"
      });
    }

    const data = await mountKnowledgePack({
      bookId: parsedParams.data.bookId,
      ...parsedBody.data
    });

    return okJson({
      path   : `/api/admin/knowledge/books/${parsedParams.data.bookId}/knowledge-packs`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACK_MOUNTED",
      message: "知识包挂载成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/books/[bookId]/knowledge-packs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包挂载失败"
    });
  }
}

/**
 * DELETE `/api/admin/knowledge/books/:bookId/knowledge-packs`
 * 移除书籍知识包关联。
 */
export async function DELETE(
  request: Request,
  context: { params: Promise<{ bookId: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = bookIdParamSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return failJson({
        path           : "/api/admin/knowledge/books/[bookId]/knowledge-packs", requestId, startedAt,
        error          : new Error("书籍 ID 不合法"), fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST, fallbackMessage: "书籍 ID 不合法"
      });
    }

    const parsedBody = unmountSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return failJson({
        path           : `/api/admin/knowledge/books/${parsedParams.data.bookId}/knowledge-packs`, requestId, startedAt,
        error          : new Error(parsedBody.error.issues[0]?.message ?? "请求参数不合法"),
        fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST, fallbackMessage: "请求参数不合法"
      });
    }

    await unmountKnowledgePack(parsedParams.data.bookId, parsedBody.data.packId);

    return okJson({
      path   : `/api/admin/knowledge/books/${parsedParams.data.bookId}/knowledge-packs`,
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_PACK_UNMOUNTED",
      message: "知识包已移除",
      data   : null
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/books/[bookId]/knowledge-packs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包移除失败"
    });
  }
}
