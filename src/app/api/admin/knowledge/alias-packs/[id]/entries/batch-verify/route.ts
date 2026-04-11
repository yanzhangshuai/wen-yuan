import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { batchVerifyEntries } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, batchVerifySchema } from "../../../../_shared";

/**
 * POST `/api/admin/knowledge/alias-packs/:id/entries/batch-verify`
 * 批量审核通过。
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]/entries/batch-verify", requestId, startedAt, "知识包 ID 不合法");
    }

    const parsedBody = batchVerifySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries/batch-verify`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const result = await batchVerifyEntries(parsedBody.data.ids);

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/entries/batch-verify`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRIES_BATCH_VERIFIED",
      message: `成功审核通过 ${result.count} 条`,
      data   : { count: result.count }
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]/entries/batch-verify",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "批量审核失败"
    });
  }
}
