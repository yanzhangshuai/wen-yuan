/**
 * @module models
 * @description AI 模型配置（AdminModel）客户端服务层
 *
 * 封装管理员模型配置相关的 HTTP 请求，对应后端路由 `/api/admin/models/*`。
 *
 * 包含内容：
 * - AdminModelItem：模型配置项类型
 * - ModelTestResult：连通性测试结果类型
 * - PatchModelBody：更新模型配置的请求体类型
 * - fetchModels：获取所有模型配置列表
 * - patchModel：更新指定模型的配置（差量 PATCH）
 * - setDefaultModel：将指定模型设为默认
 * - testModel：测试指定模型的连通性
 */
import { clientFetch } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 模型配置项
 * 对应 GET /api/admin/models 响应中 data 数组的单个元素。
 */
export interface AdminModelItem {
  id          : string;
  provider    : string;
  name        : string;
  modelId     : string;
  baseUrl     : string;
  apiKeyMasked: string | null;
  isConfigured: boolean;
  isEnabled   : boolean;
  isDefault   : boolean;
  updatedAt   : string;
}

/**
 * 连通性测试结果
 * 对应 POST /api/admin/models/:id/test 响应中的 data 字段。
 */
export interface ModelTestResult {
  message  : string;
  latencyMs: number | null;
}

/**
 * 更新模型配置的请求体（差量 PATCH）
 * apiKey 传 null 表示清除已有 Key，传字符串表示更新，不传表示保持原值。
 */
export interface PatchModelBody {
  baseUrl  ?: string;
  apiKey   ?: string | null;
  isEnabled?: boolean;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取所有 AI 模型配置列表。
 * 对应接口：GET /api/admin/models
 *
 * 失败时抛出 Error，message 为可展示文案。
 *
 * @returns AdminModelItem[] 模型配置项数组
 */
export async function fetchModels(): Promise<AdminModelItem[]> {
  return clientFetch<AdminModelItem[]>("/api/admin/models", {
    cache: "no-store"
  });
}

/**
 * 更新指定模型的配置（差量 PATCH）。
 * 对应接口：PATCH /api/admin/models/:id
 *
 * 只传需要变更的字段，未传字段保持原值。
 * 成功时返回更新后的模型数据；失败时抛出 Error。
 *
 * @param id   模型 ID
 * @param body 变更字段
 * @returns 更新后的 AdminModelItem
 */
export async function patchModel(id: string, body: PatchModelBody): Promise<AdminModelItem> {
  return clientFetch<AdminModelItem>(`/api/admin/models/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 将指定模型设为默认模型。
 * 对应接口：POST /api/admin/models/:id/set-default
 *
 * 成功时返回更新后的模型数据（其他模型的 isDefault 由后端统一处理）。
 * 失败时抛出 Error。
 *
 * @param id 模型 ID
 * @returns 更新后的 AdminModelItem
 */
export async function setDefaultModel(id: string): Promise<AdminModelItem> {
  return clientFetch<AdminModelItem>(`/api/admin/models/${id}/set-default`, {
    method: "POST"
  });
}

/**
 * 测试指定模型的网络连通性。
 * 对应接口：POST /api/admin/models/:id/test
 *
 * 成功时返回测试结果（含延迟）；失败时抛出 Error，message 为可展示文案。
 *
 * @param id 模型 ID
 * @returns ModelTestResult
 */
export async function testModel(id: string): Promise<ModelTestResult> {
  return clientFetch<ModelTestResult>(`/api/admin/models/${id}/test`, {
    method: "POST"
  });
}
