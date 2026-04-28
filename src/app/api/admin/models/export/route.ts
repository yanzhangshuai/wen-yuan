import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { exportAdminModels } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/models/export";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const data = await exportAdminModels();
    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_MODELS_EXPORTED",
      message: "模型配置导出成功",
      data
    });
  } catch (error) {
    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型配置导出失败"
    });
  }
}
