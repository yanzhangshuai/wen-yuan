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
 * 文件定位（Next.js Route Handler / 管理后台策略配置）：
 * - 目录约定决定该文件同时承载 `/api/admin/model-strategy/global` 的 GET/PUT。
 * - GET 负责读取全局模型策略，PUT 负责覆盖保存策略。
 *
 * 框架语义：
 * - App Router 下，导出同名 HTTP 方法函数即可声明接口；
 * - 这里未显式 `runtime`，沿用项目默认 Node.js Runtime。
 */

/**
 * GET `/api/admin/model-strategy/global`
 * 功能：查询全局模型策略配置（管理员鉴权）。
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    // 策略配置是后台控制面能力，必须管理员权限。
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
    // 读取失败统一走 failJson，确保错误壳结构稳定。
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
    // 写操作同样必须管理员权限，防止普通用户篡改全局调度策略。
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    // 请求体 schema 校验：保证 stages 配置结构与下游 service 约定一致。
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
      // 业务校验错误归类为 400，提示调用方修正配置内容。
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
