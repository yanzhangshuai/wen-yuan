import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { batchRejectEntries } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, batchRejectSchema, uuidParamSchema } from "../../../../_shared";

/**
 * POST `/api/admin/knowledge/alias-packs/:id/entries/batch-reject`
 * 批量审核拒绝。
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]/entries/batch-reject", requestId, startedAt, "知识包 ID 不合法");
    }

    const parsedBody = batchRejectSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries/batch-reject`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const result = await batchRejectEntries(parsedBody.data.ids, parsedBody.data.note);

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries/batch-reject`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRIES_BATCH_REJECTED",
      message: `成功拒绝 ${result.count} 条`,
      data   : { count: result.count }
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]/entries/batch-reject",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "批量拒绝失败"
    });
  }
}
