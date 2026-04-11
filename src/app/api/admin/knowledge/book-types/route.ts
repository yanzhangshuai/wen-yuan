import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listBookTypes, createBookType } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createBookTypeSchema } from "../_shared";

/**
 * GET `/api/admin/knowledge/book-types`
 * 管理端：列出所有书籍类型。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const active = url.searchParams.get("active");

    const data = await listBookTypes({
      active: active === "true" ? true : active === "false" ? false : undefined
    });

    return okJson({
      path   : "/api/admin/knowledge/book-types",
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_TYPES_LISTED",
      message: "书籍类型列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/book-types",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍类型列表获取失败"
    });
  }
}

/**
 * POST `/api/admin/knowledge/book-types`
 * 管理端：创建书籍类型。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createBookTypeSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(
        "/api/admin/knowledge/book-types",
        requestId,
        startedAt,
        parsed.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createBookType(parsed.data);

    return okJson({
      path   : "/api/admin/knowledge/book-types",
      requestId,
      startedAt,
      code   : "ADMIN_BOOK_TYPE_CREATED",
      message: "书籍类型创建成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/book-types",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "书籍类型创建失败"
    });
  }
}
