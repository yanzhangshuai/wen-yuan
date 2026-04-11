import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { verifyEntry } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, uuidParamSchema } from "../../../_shared";

/**
 * POST `/api/admin/knowledge/alias-entries/:id/verify`
 * 审核通过条目。
 */
export async function POST(
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
      return badRequestJson("/api/admin/knowledge/alias-entries/[id]/verify", requestId, startedAt, "ID 不合法");
    }

    const data = await verifyEntry(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/knowledge/alias-entries/${parsedParams.data.id}/verify`,
      requestId,
      startedAt,
      code   : "ADMIN_ENTRY_VERIFIED",
      message: "条目审核通过",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/knowledge/alias-entries/[id]/verify",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "审核通过失败"
    });
  }
}
