import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { updateAdminModel } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, modelRouteParamsSchema, updateModelBodySchema } from "../_shared";

/**
 * PATCH `/api/admin/models/:id`
 * 功能：更新单个模型配置（模型标识 / API Key / BaseURL / 启用状态）。
 * 入参：
 * - 路由参数：`id`（模型 UUID）；
 * - 请求体：`modelId | apiKey | baseUrl | isEnabled`（至少一个字段）。
 * 返回：更新后的模型配置快照。
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

    const parsedParams = modelRouteParamsSchema.safeParse(await context.params);
    if (!parsedParams.success) {
      return badRequestJson(
        "/api/admin/models/[id]",
        requestId,
        startedAt,
        parsedParams.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const parsedBody = updateModelBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        `/api/admin/models/${parsedParams.data.id}`,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await updateAdminModel(parsedParams.data.id, parsedBody.data);

    return okJson({
      path   : `/api/admin/models/${parsedParams.data.id}`,
      requestId,
      startedAt,
      code   : "ADMIN_MODEL_UPDATED",
      message: "模型配置更新成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/models/[id]",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型配置更新失败"
    });
  }
}
