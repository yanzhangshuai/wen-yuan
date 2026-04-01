import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { z } from "zod";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  ALIAS_MAPPING_STATUS_VALUES,
  aliasRegistryService
} from "@/server/modules/analysis/services/AliasRegistryService";
import { ALIAS_TYPE_VALUES } from "@/types/analysis";
import { ERROR_CODES } from "@/types/api";

const routeParamsSchema = z.object({
  id: z.string().uuid("书籍 ID 不合法")
});

const aliasMappingQuerySchema = z.object({
  status: z.enum(ALIAS_MAPPING_STATUS_VALUES).optional()
});

const createAliasMappingBodySchema = z.object({
  alias       : z.string().trim().min(1, "alias 不能为空"),
  resolvedName: z.string().trim().min(1, "resolvedName 不能为空").optional(),
  aliasType   : z.enum(ALIAS_TYPE_VALUES),
  personaId   : z.string().uuid("personaId 不合法").optional(),
  confidence  : z.number().min(0).max(1).optional(),
  evidence    : z.string().trim().min(1).optional(),
  chapterStart: z.number().int().positive().optional(),
  chapterEnd  : z.number().int().positive().optional(),
  status      : z.enum(ALIAS_MAPPING_STATUS_VALUES).optional()
});

function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string
): Response {
  return failJson({
    path,
    requestId,
    startedAt,
    error          : new Error(detail),
    fallbackCode   : ERROR_CODES.COMMON_BAD_REQUEST,
    fallbackMessage: detail,
    status         : 400
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/alias-mappings";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "书籍 ID 不合法");
    }

    const url = new URL(request.url);
    const parsedQuery = aliasMappingQuerySchema.safeParse({
      status: url.searchParams.get("status") ?? undefined
    });
    if (!parsedQuery.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedQuery.error.issues[0]?.message ?? "查询参数不合法");
    }

    const data = await aliasRegistryService.listReviewMappings(parsedParams.data.id, parsedQuery.data.status);
    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_ALIAS_MAPPINGS_LISTED",
      message: "别名映射列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "别名映射列表获取失败"
    });
  }
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const routePath = "/api/books/[id]/alias-mappings";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = routeParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedParams.error.issues[0]?.message ?? "书籍 ID 不合法");
    }

    const parsedBody = createAliasMappingBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(routePath, requestId, startedAt, parsedBody.error.issues[0]?.message ?? "请求体不合法");
    }

    await aliasRegistryService.registerAlias({
      bookId      : parsedParams.data.id,
      alias       : parsedBody.data.alias,
      resolvedName: parsedBody.data.resolvedName,
      aliasType   : parsedBody.data.aliasType,
      personaId   : parsedBody.data.personaId,
      confidence  : parsedBody.data.confidence ?? 1,
      evidence    : parsedBody.data.evidence,
      chapterStart: parsedBody.data.chapterStart,
      chapterEnd  : parsedBody.data.chapterEnd,
      status      : parsedBody.data.status ?? "CONFIRMED"
    });

    // 查询刚创建/更新的记录（按 alias + bookId 精确匹配，取最高置信度）
    const data = await aliasRegistryService.listReviewMappings(parsedParams.data.id);
    const created = data.find(
      (m) => m.alias === parsedBody.data.alias.trim().toLowerCase()
    ) ?? data[0] ?? null;

    return okJson({
      path   : routePath,
      requestId,
      startedAt,
      code   : "BOOK_ALIAS_MAPPING_CREATED",
      message: "别名映射创建成功",
      data   : created,
      status : 201
    });
  } catch (error) {
    return failJson({
      path           : routePath,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "别名映射创建失败"
    });
  }
}
