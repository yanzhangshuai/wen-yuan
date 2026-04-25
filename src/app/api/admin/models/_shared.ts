import { createApiMeta, errorResponse, toNextJson } from "@/server/http/api-response";
import { ERROR_CODES } from "@/types/api";

import { z } from "zod";

/**
 * 文件定位（Route 共享辅助）：
 * - 服务于 `/api/admin/models/**` 路由族的参数校验与错误响应构造。
 * - 通过抽取公共 schema，保证不同子路由（列表/更新/测试/设默认）遵循一致协议。
 */

/** 模型路由参数 Schema（`/api/admin/models/:id`）。 */
export const modelRouteParamsSchema = z.object({
  /** 模型主键 UUID（来自动态路由 params，而非请求体）。 */
  id: z.string().uuid("模型 ID 不合法")
});

/** 更新模型配置请求体 Schema。 */
export const updateModelBodySchema = z.object({
  /** 供应商侧模型标识（接口字段），为空字符串视为无效输入。 */
  providerModelId: z.string().trim().min(1, "模型标识不能为空").optional(),
  /** API Key：可选；允许显式传 `null` 表示“清空已存储密钥”（业务规则）。 */
  apiKey         : z.string().trim().min(1, "API Key 不能为空").nullable().optional(),
  /** 自定义 BaseURL：仅接受完整 URL，避免后续请求拼接出错。 */
  baseUrl        : z.string().trim().url("BaseURL 格式不合法").optional(),
  /** 是否启用模型开关，影响该模型是否可被策略层选择。 */
  isEnabled      : z.boolean().optional()
}).refine((value) => Object.keys(value).length > 0, {
  // 防御目的：拒绝“空更新”请求，避免看似成功但实际无变更，造成调用方误判。
  message: "至少提供一个可更新字段"
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
  // 统一 meta 结构，保证 API 观测字段（requestId / duration）在错误场景也可追踪。
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

/** 创建模型请求体 Schema。 */
export const createModelBodySchema = z.object({
  /** 供应商标识，自由字符串（如 deepseek / openai / my-provider）。 */
  provider       : z.string({ required_error: "供应商不能为空" }).trim().min(1, "供应商不能为空"),
  /** 管理端展示名称。 */
  name           : z.string({ required_error: "名称不能为空" }).trim().min(1, "名称不能为空"),
  /** 供应商侧模型标识（实际调用使用）。 */
  providerModelId: z.string({ required_error: "模型标识不能为空" }).trim().min(1, "模型标识不能为空"),
  /** API 基础地址（合法 HTTPS URL）。 */
  baseUrl        : z.string({ required_error: "BaseURL 不能为空" }).trim().url("BaseURL 格式不合法"),
  /** 明文 API Key（可选）。 */
  apiKey         : z.string().trim().min(1, "API Key 不能为空").optional()
});
