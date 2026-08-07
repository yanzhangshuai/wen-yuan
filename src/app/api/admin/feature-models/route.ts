import { randomUUID } from "node:crypto";

import { headers } from "next/headers";

import { readJsonBody } from "@/server/http/read-json-body";
import { failJson, okJson } from "@/server/http/route-utils";
import { getAuthContext, requireAdmin } from "@/server/modules/auth";
import {
  FeatureModelError,
  listFeatureModels,
  upsertFeatureModel
} from "@/server/modules/models/featureModels";
import { ERROR_CODES } from "@/types/api";
import type { FeatureKey } from "@/types/pipeline";

import { badRequestJson, upsertFeatureModelBodySchema } from "./_shared";

/**
 * 文件定位（Next.js Route Handler / 管理后台功能点模型）：
 * - 目录约定映射到 `/api/admin/feature-models`。
 * - v5 模型策略（阶段 4）：9 阶段矩阵删除后，模型按功能点（SKILL_SELECTOR / PIPELINE_MAIN / REVIEW）
 *   全局映射，这里提供映射的查询与维护。
 */

/**
 * GET `/api/admin/feature-models`
 * 功能：查询全部功能点及其模型映射（含未配置项）。
 */
export async function GET(): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const data = await listFeatureModels();

    return okJson({
      path   : "/api/admin/feature-models",
      requestId,
      startedAt,
      code   : "ADMIN_FEATURE_MODELS_LISTED",
      message: "功能点模型列表获取成功",
      data
    });
  } catch (error) {
    return failJson({
      path           : "/api/admin/feature-models",
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "功能点模型列表获取失败"
    });
  }
}

/**
 * PUT `/api/admin/feature-models`
 * 功能：更新某个功能点指向的模型（modelId 为 null 表示清除映射）。
 */
export async function PUT(request: Request): Promise<Response> {
  const startedAt = Date.now();
  const requestId = randomUUID();
  const path = "/api/admin/feature-models";

  try {
    const auth = await getAuthContext(await headers());
    requireAdmin(auth);

    const parsedBody = upsertFeatureModelBodySchema.safeParse(await readJsonBody(request));
    if (!parsedBody.success) {
      return badRequestJson(
        path,
        requestId,
        startedAt,
        parsedBody.error.issues[0]?.message ?? "请求参数不合法"
      );
    }

    const { featureKey, modelId } = parsedBody.data;
    // zod 枚举产出字符串字面量，此处收敛为 FeatureKey 枚举类型后再进入服务层。
    const featureKeyValue = featureKey as FeatureKey;
    await upsertFeatureModel(featureKeyValue, modelId);

    // 返回更新后的该项（含最新时间戳），便于前端就地回写状态。
    const updatedList = await listFeatureModels();
    const updated = updatedList.find((item) => item.featureKey === featureKeyValue) ?? null;

    return okJson({
      path,
      requestId,
      startedAt,
      code   : "ADMIN_FEATURE_MODEL_UPSERTED",
      message: "功能点模型保存成功",
      data   : updated
    });
  } catch (error) {
    if (error instanceof FeatureModelError) {
      // 业务校验错误（模型不存在/未启用）归类为 400。
      return badRequestJson(path, requestId, startedAt, error.message, error.message);
    }

    return failJson({
      path,
      requestId,
      startedAt,
      error,
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "功能点模型保存失败"
    });
  }
}
