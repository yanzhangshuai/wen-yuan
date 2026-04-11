import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { rejectEntry } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema, rejectSchema } from "../../../_shared";

/**
 * POST `/api/admin/knowledge/alias-entries/:id/reject`
 * 审核拒绝条目。
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
      return badRequestJson("/api/admin/knowledge/alias-entries/[id]/reject", requestId, startedAt, "ID 不合法");
    }

    const parsedBody = rejectSchema.safeParse(await readJsonBody(request));
    const data = await rejectEntry(parsedParams.data.id, parsedBody.data?.note);

    return okJson({
      path   : `/api/admin/knowledge/alias-entries/${parsedParams.data.id}/reject`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRY_REJECTED",
      message: "条目审核已拒绝",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-entries/[id]/reject",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核拒绝失败"
    });
  }
}
