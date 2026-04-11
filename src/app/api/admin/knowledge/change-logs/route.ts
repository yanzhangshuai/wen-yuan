import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listChangeLogs } from "@/server/modules/knowledge";
import { ERROR_CODES } from "@/types/api";

const PATH = "/api/admin/knowledge/change-logs";

export async function GET(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const url = new URL(request.url);
    const data = await listChangeLogs({
      objectType: url.searchParams.get("objectType") ?? undefined,
      objectId  : url.searchParams.get("objectId") ?? undefined,
      action    : url.searchParams.get("action") ?? undefined,
      from      : url.searchParams.get("from") ?? undefined,
      to        : url.searchParams.get("to") ?? undefined,
      page      : url.searchParams.get("page") ? Number(url.searchParams.get("page")) : undefined,
      pageSize  : url.searchParams.get("pageSize") ? Number(url.searchParams.get("pageSize")) : undefined
    });

    return okJson({ path: PATH, requestId, startedAt, code: "ADMIN_CHANGE_LOGS_LISTED", message: "变更日志列表获取成功", data });
  } catch (error) {
    return failJson({ path: PATH, requestId, startedAt, error, fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR, fallbackMessage: "变更日志列表获取失败" });
  }
}
