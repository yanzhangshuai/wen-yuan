import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  getGlobalStrategy,
  ModelStrategyValidationError,
  saveGlobalStrategy
} from "@/server/modules/analysis/services/modelStrategyAdminService";
import { ERROR_CODES } from "@/types/api";

import { badRequestJson, upsertStrategyBodySchema } from "../_shared";

/**
 * GET `/api/admin/model-strategy/global`
 * 功能：查询全局模型策略配置（管理员鉴权）。
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const data = await getGlobalStrategy();

    return okJson({
      path   : "/api/admin/model-strategy/global",
      requestId,
      startedAt,
      code   : "ADMIN_GLOBAL_MODEL_STRATEGY_FETCHED",
      message: "全局模型策略获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/model-strategy/global",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "全局模型策略获取失败"
    });
  }
}

/**
 * PUT `/api/admin/model-strategy/global`
 * 功能：保存全局模型策略配置（管理员鉴权）。
 */
export async function PUT(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/model-strategy/global";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = upsertStrategyBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const data = await saveGlobalStrategy(parsedBody.data.stages);

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_GLOBAL_MODEL_STRATEGY_SAVED",
      message: "全局模型策略保存成功",
      data
    });
  } catch (error) {
    if (error instanceof ModelStrategyValidationError) {
      return badRequestJson(path, requestId, startedAt, error.message, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "全局模型策略保存失败"
    });
  }
}
