import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { listAdminModels } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = getAuthContext(await headers());
    requireAdmin(auth);

    const data = await listAdminModels();

    return okJson({
      path   : "/api/admin/models",
      requestId,
      startedAt,
      code   : "ADMIN_MODELS_LISTED",
      message: "模型列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/models",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型列表获取失败"
    });
  }
}
