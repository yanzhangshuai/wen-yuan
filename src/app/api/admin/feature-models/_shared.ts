import { z } from "zod";

import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

/**
 * ============================================================================
 * 文件定位：`src/app/api/admin/feature-models/_shared.ts`
 * ----------------------------------------------------------------------------
 * 功能点模型接口族（GET 列表 / PUT 更新）的请求体校验与错误响应辅助。
 * v5 模型策略（阶段 4）：模型按功能点全局映射，管理端维护 `feature_models` 表。
 * ============================================================================
 */

/** 功能点键枚举（与 FeatureKey 一致）。 */
export const featureModelKeySchema = z.enum(["SKILL_SELECTOR", "PIPELINE_MAIN", "REVIEW"]);

/** 更新功能点模型请求体：modelId 为 null 表示清除映射（回退系统默认）。 */
export const upsertFeatureModelBodySchema = z.object({
  featureKey: featureModelKeySchema,
  modelId   : z.string().uuid("模型 ID 不合法").nullable()
});

/**
 * 功能：构造统一的 400 参数错误响应。
 * 输入：path、requestId、startedAt、detail、可选 message。
 * 输出：HTTP 400 响应。
 * 异常：无。
 * 副作用：无。
 */
export function badRequestJson(
  path: string,
  requestId: string,
  startedAt: number,
  detail: string,
  message = "请求参数不合法"
): Response {
  const meta = createApiMeta(path, requestId, startedAt);
  return toNextJson(
    errorResponse(
      ERROR_CODES.COMMON_BAD_REQUEST,
      message,
      {
        type: "ValidationError",
        detail
      },
      meta
    ),
    400
  );
}
