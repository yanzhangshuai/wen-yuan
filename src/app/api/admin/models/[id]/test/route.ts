import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { testAdminModelConnection } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, modelRouteParamsSchema } from "../../_shared";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = getAuthContext(await headers());
    requireAdmin(auth);

    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]/test",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await testAdminModelConnection(parsedParams.data.id);

    return okJson({
      path   : `/api/admin/models/${parsedParams.data.id}/test`,
      requestId,
      startedAt,
      code   : "ADMIN_MODEL_CONNECTION_TESTED",
      message: "模型连通性测试完成",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/models/[id]/test",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型连通性测试失败"
    });
  }
}
