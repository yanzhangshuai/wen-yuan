/**
 * ============================================================================
 * 文件定位：`src/lib/services/models.ts`
 * ----------------------------------------------------------------------------
 * 管理端“模型配置中心”客户端服务层。
 *
 * 在 Next.js 项目中的定位：
 * - 非路由文件，属于前端数据访问层；
 * - 典型调用方是管理员 Client Component（模型列表、编辑弹窗、连通性测试按钮）。
 *
 * 业务职责：
 * - 查询模型配置列表；
 * - 差量更新模型配置；
 * - 设置默认模型；
 * - 触发模型连通性测试。
 *
 * 设计目的：
 * - 让 UI 组件只关心“业务数据”和“交互状态”，不关心具体 HTTP 细节；
 * - 通过统一服务函数，降低多个页面重复实现网络请求的维护成本。
 * ============================================================================
 */
import { clientFetch } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 模型配置项
 * 对应 GET /api/admin/models 响应中 data 数组的单个元素。
 *
 * 说明：该类型是“前端展示模型 + 业务控制模型”的混合体，
 * 同时服务于列表展示、编辑表单默认值、启停控制与健康度评估。
 */
export interface AdminModelItem {
  /** 模型配置记录 ID（数据库主键）。 */
  id             : string;
  /** 模型供应商标识（如 OpenAI / Anthropic 等）。 */
  provider       : string;
  /** 调用协议。 */
  protocol       : "openai-compatible" | "gemini";
  /** 业务展示名称（运营可读）。 */
  name           : string;
  /** 供应商侧模型 ID（实际调用时使用）。 */
  providerModelId: string;
  /** 业务别名键，可空；空表示未设置别名。 */
  aliasKey       : string | null;
  /** API 基础地址。 */
  baseUrl        : string;
  /** 脱敏后的 API Key，用于前端展示“已配置”状态。 */
  apiKeyMasked   : string | null;
  /** 是否已完成关键配置（通常由后端根据 key/baseUrl 等判定）。 */
  isConfigured   : boolean;
  /**
   * 性能统计快照（来自历史调用聚合）。
   * 业务意义：用于辅助管理员判断模型稳定性、成本与速度。
   */
  performance    : {
    /** 调用总次数。 */
    callCount          : number;
    /** 成功率（0~1），空值表示暂无统计样本。 */
    successRate        : number | null;
    /** 平均时延（毫秒），空值表示暂无统计样本。 */
    avgLatencyMs       : number | null;
    /** 平均输入 token，空值表示暂无统计样本。 */
    avgPromptTokens    : number | null;
    /** 平均输出 token，空值表示暂无统计样本。 */
    avgCompletionTokens: number | null;
    /**
     * 三维业务评分。
     * 这是业务评级，不是技术限制，可用于前端排序或标签展示。
     */
    ratings            : {
      /** 速度评分。 */
      speed    : number;
      /** 稳定性评分。 */
      stability: number;
      /** 成本评分。 */
      cost     : number;
    };
  };
  /** 是否启用。禁用后不应参与模型选择。 */
  isEnabled: boolean;
  /** 是否系统默认模型。 */
  isDefault: boolean;
  /** 最近更新时间（ISO 字符串）。 */
  updatedAt: string;
}

/**
 * 连通性测试结果
 * 对应 POST /api/admin/models/:id/test 响应中的 data 字段。
 *
 * 业务语义：
 * - `success=true` 表示请求成功打通到目标模型；
 * - `success=false` 时通过 `errorType/errorMessage` 提供可运营排障信息。
 */
export interface ModelTestResult {
  /** 是否连通成功。 */
  success      : boolean;
  /** 成功时的请求耗时（毫秒）。 */
  latencyMs?   : number;
  /** 面向用户的测试结果说明文案。 */
  detail       : string;
  /** 失败分类，用于前端展示更明确的故障类型。 */
  errorType?   : "NETWORK_ERROR" | "AUTH_ERROR" | "MODEL_UNAVAILABLE" | "TIMEOUT";
  /** 失败详情（可用于日志或高级提示）。 */
  errorMessage?: string;
}

/**
 * 更新模型配置的请求体（差量 PATCH）
 * apiKey 传 null 表示清除已有 Key，传字符串表示更新，不传表示保持原值。
 *
 * 业务约束：
 * - 这是“部分更新”契约，调用方不应把未变更字段全部回传；
 * - `apiKey` 的三态（undefined/null/string）有明确语义，不能混用。
 */
export interface PatchModelBody {
  provider?       : string;
  protocol?       : "openai-compatible" | "gemini";
  name?           : string;
  aliasKey?       : string | null;
  /** 供应商模型 ID。 */
  providerModelId?: string;
  /** API 基础地址。 */
  baseUrl?        : string;
  /** API Key：`null`=清空，`string`=更新，`undefined`=保持不变。 */
  apiKey?         : string | null;
  /** 启停状态。 */
  isEnabled?      : boolean;
}

export interface CreateModelBody {
  provider  : string;
  protocol  : "openai-compatible" | "gemini";
  name      : string;
  modelId   : string;
  aliasKey? : string | null;
  baseUrl   : string;
  apiKey?   : string;
  isEnabled?: boolean;
  isDefault?: boolean;
}

export interface ExportedModelConfig {
  provider : string;
  protocol : "openai-compatible" | "gemini";
  name     : string;
  modelId  : string;
  aliasKey : string | null;
  baseUrl  : string;
  isEnabled: boolean;
  isDefault: boolean;
}

export interface ImportModelsResult {
  created: number;
  updated: number;
  models : AdminModelItem[];
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取所有 AI 模型配置列表。
 * 对应接口：GET /api/admin/models
 *
 * 为什么 `cache: "no-store"`：
 * - 管理台配置经常变更，列表若走缓存会出现“刚改完但页面还是旧值”的错觉。
 *
 * @returns AdminModelItem[] 模型配置项数组
 */
export async function fetchModels(): Promise<AdminModelItem[]> {
  return clientFetch<AdminModelItem[]>("/api/admin/models", {
    cache: "no-store"
  });
}

export async function createModel(body: CreateModelBody): Promise<AdminModelItem> {
  return clientFetch<AdminModelItem>("/api/admin/models", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 更新指定模型的配置（差量 PATCH）。
 * 对应接口：PATCH /api/admin/models/:id
 *
 * 只传需要变更的字段，未传字段保持原值。
 * 成功时返回更新后的模型数据；失败时抛出 Error（由调用方 toast/表单提示）。
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

export async function deleteModel(id: string): Promise<{ id: string }> {
  return clientFetch<{ id: string }>(`/api/admin/models/${id}`, {
    method: "DELETE"
  });
}

export async function exportModels(): Promise<ExportedModelConfig[]> {
  return clientFetch<ExportedModelConfig[]>("/api/admin/models/export", {
    cache: "no-store"
  });
}

export async function importModels(models: ExportedModelConfig[]): Promise<ImportModelsResult> {
  return clientFetch<ImportModelsResult>("/api/admin/models/import", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(models)
  });
}

/**
 * 将指定模型设为默认模型。
 * 对应接口：POST /api/admin/models/:id/set-default
 *
 * 成功时返回更新后的模型数据。
 * 关键业务语义：其他模型的 `isDefault` 由后端统一下沉处理，前端不应自行推断。
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
 * 业务用途：
 * - 在“保存配置前/后”进行可用性验证；
 * - 让运维或运营快速判断是网络问题、鉴权问题还是模型不可用。
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
