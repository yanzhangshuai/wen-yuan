import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { importEntries } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, importEntriesSchema } from "../../../_shared";

/**
 * POST `/api/admin/knowledge/alias-packs/:id/import`
 * 导入条目（JSON 格式）。
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
      return badRequestJson("/api/admin/knowledge/alias-packs/[id]/import", requestId, startedAt, "知识包 ID 不合法");
    }

    const parsedBody = importEntriesSchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/import`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const result = await importEntries(
      parsedParams.data.id,
      parsedBody.data.entries,
      {
        reviewStatus: parsedBody.data.reviewStatus,
        source      : parsedBody.data.source,
        auditAction : parsedBody.data.auditAction,
        operatorId  : auth.userId ?? undefined
      }
    );

    return okJson({
      path   : `/api/admin/knowledge/alias-packs/${parsedParams.data.id}/import`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRIES_IMPORTED",
      message: `成功导入 ${result.count} 条`,
      data   : result
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-packs/[id]/import",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "导入失败"
    });
  }
}
