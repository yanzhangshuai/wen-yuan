import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listKnowledgePacks, createKnowledgePack } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, createPackSchema } from "../_shared";

/**
 * GET `/api/admin/knowledge/alias-packs`
 * 列出知识包（支持 bookTypeId / scope 过滤）。
 */
export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const data = await listKnowledgePacks({
      bookTypeId: url.searchParams.get("bookTypeId") ?? undefined,
      scope     : url.searchParams.get("scope") ?? undefined
    });

    return okJson({
      path   : "/api/admin/knowledge/alias-packs",
      requestId,
      startedAt,
      code   : "ADMIN_ALIAS_PACKS_LISTED",
      message: "知识包列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包列表获取失败"
    });
  }
}

/**
 * POST `/api/admin/knowledge/alias-packs`
 * 创建知识包。
 */
export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsed = createPackSchema.safeParse(await readJsonBody(request));
    if (!parsed.success) {
      return badRequestJson(
        "/api/admin/knowledge/alias-packs",
        requestId,
        startedAt,
        parsed.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createKnowledgePack(parsed.data);

    return okJson({
      path   : "/api/admin/knowledge/alias-packs",
      requestId,
      startedAt,
      code   : "ADMIN_ALIAS_PACK_CREATED",
      message: "知识包创建成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包创建失败"
    });
  }
}
