import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { updateKnowledgeEntry, deleteKnowledgeEntry } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, updateEntrySchema } from "../../_shared";

/**
 * PATCH `/api/admin/knowledge/alias-entries/:id`
 * 更新单条条目。
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
      return badRequestJson("/api/admin/knowledge/alias-entries/[id]", requestId, startedAt, "ID 不合法");
    }

    const parsedBody = updateEntrySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/alias-entries/${parsedParams.data.id}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateKnowledgeEntry(parsedParams.data.id, parsedBody.data);

    return okJson({
      path   : `/api/admin/knowledge/alias-entries/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRY_UPDATED",
      message: "条目更新成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-entries/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "条目更新失败"
    });
  }
}

/**
 * DELETE `/api/admin/knowledge/alias-entries/:id`
 * 删除条目。
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
      return badRequestJson("/api/admin/knowledge/alias-entries/[id]", requestId, startedAt, "ID 不合法");
    }

    await deleteKnowledgeEntry(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/knowledge/alias-entries/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRY_DELETED",
      message: "条目删除成功",
      data   : null
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-entries/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "条目删除失败"
    });
  }
}
