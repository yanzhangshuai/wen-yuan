import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { getKnowledgePack, updateKnowledgePack, deleteKnowledgePack } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, notFoundJson, uuidParamSchema, updatePackSchema } from "../../_shared";

/**
 * GET `/api/admin/knowledge/alias-packs/:id`
 * 获取知识包详情。
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]", requestId, startedAt, "知识包 ID 不合法");
    }

    const data = await getKnowledgePack(parsedParams.data.id);
    if (!data) {
      return notFoundJson("/api/admin/knowledge/alias-packs/[id]", requestId, startedAt, "知识包不存在");
    }

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_ALIAS_PACK_DETAIL",
      message: "知识包详情获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包详情获取失败"
    });
  }
}

/**
 * PATCH `/api/admin/knowledge/alias-packs/:id`
 * 更新知识包。
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]", requestId, startedAt, "知识包 ID 不合法");
    }

    const parsedBody = updatePackSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/alias-packs/${parsedParams.data.id}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateKnowledgePack(parsedParams.data.id, parsedBody.data);

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_ALIAS_PACK_UPDATED",
      message: "知识包更新成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包更新失败"
    });
  }
}

/**
 * DELETE `/api/admin/knowledge/alias-packs/:id`
 * 删除知识包。
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]", requestId, startedAt, "知识包 ID 不合法");
    }

    await deleteKnowledgePack(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_ALIAS_PACK_DELETED",
      message: "知识包删除成功",
      data   : null
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "知识包删除失败"
    });
  }
}
