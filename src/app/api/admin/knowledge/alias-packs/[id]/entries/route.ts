import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson, parsePagination } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listKnowledgeEntries, createKnowledgeEntry } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, createEntrySchema } from "../../../_shared";

/**
 * GET `/api/admin/knowledge/alias-packs/:id/entries`
 * 列出知识包下的条目（支持分页、状态过滤、搜索）。
 */
export async function GET(
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]/entries", requestId, startedAt, "知识包 ID 不合法");
    }

    const url = new URL(request.url);
    const { page, pageSize } = parsePagination(url.searchParams);

    const result = await listKnowledgeEntries({
      packId      : parsedParams.data.id,
      reviewStatus: url.searchParams.get("reviewStatus") ?? undefined,
      q           : url.searchParams.get("q") ?? undefined,
      page,
      pageSize
    });

    return okJson({
      path      : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries`,
      requestId,
      startedAt,
      code      : "ADMIN_ENTRIES_LISTED",
      message   : "条目列表获取成功",
      data      : result.entries,
      pagination: { page: result.page, pageSize: result.pageSize, total: result.total }
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]/entries",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "条目列表获取失败"
    });
  }
}

/**
 * POST `/api/admin/knowledge/alias-packs/:id/entries`
 * 添加单条条目。
 */
export async function POST(
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]/entries", requestId, startedAt, "知识包 ID 不合法");
    }

    const parsedBody = createEntrySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await createKnowledgeEntry({
      packId: parsedParams.data.id,
      ...parsedBody.data
    });

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRY_CREATED",
      message: "条目创建成功",
      data,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]/entries",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "条目创建失败"
    });
  }
}
