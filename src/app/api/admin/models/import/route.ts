import { randomUUID } from "node:crypto";

import { headers } from "next/headers";
import { ZodError } from "zod";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import { importAdminModels, ModelConfigurationError } from "@/server/modules/models";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson } from "../_shared";

export async function POST(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/models/import";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const data = await importAdminModels(await readJsonBody(request));
    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_MODELS_IMPORTED",
      message: "模型配置导入成功",
      data
    });
  } catch (error) {
    if (error instanceof ZodError) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    if (error instanceof ModelConfigurationError) {
      return failJson({
        path,
        requestId,
        startedAt,
        error,
        fallbackCode   : error.code,
        fallbackMessage: error.message,
        status         : error.status
      });
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "模型配置导入失败"
    });
  }
}
