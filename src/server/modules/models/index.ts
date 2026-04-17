/**
 * =============================================================================
 * 文件定位（服务层：AI 模型配置与连通性管理）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/models/index.ts`
 *
 * 模块角色：
 * - 属于服务端“模型治理”领域模块，负责模型列表、启停、默认模型切换、密钥更新、
 *   连通性测试与性能快照组装；
 * - 是管理后台“模型管理页”背后的核心业务实现，不直接暴露 HTTP 协议。
 *
 * 在系统中的上下游：
 * - 上游：`/api/admin/models*`、`/api/admin/models/:id/test` 等 Route Handler；
 * - 下游：Prisma（模型配置 + 调用日志统计）、加解密模块、外部模型网关探测。
 *
 * 关键业务约束：
 * - API Key 必须以密文存储，读取时仅在必要路径解密；
 * - 连通性测试必须走白名单域名校验，防止 SSRF 风险；
 * - “默认模型唯一”是业务规则，不是技术偶然，涉及全局推理链路稳定性。
 * =============================================================================
 */
import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { decryptValue, encryptValue, maskSensitiveValue } from "@/server/security/encryption";

import {
  assertConnectivityBaseUrlAllowed,
  classifyHttpErrorType,
  classifySemanticErrorType,
  classifyThrownErrorType,
  extractResponseDetail,
  getErrorMessage,
  validateOpenAiCompatibleProbePayload
} from "./connectivity";

/** 便于测试注入的 fetch 签名类型，避免在单测里强耦合全局 fetch。 */
type FetchImpl = typeof fetch;
/** 平台当前支持的 AI 提供商枚举（与数据库 provider 字段取值保持一致）。 */
export type SupportedProvider = "deepseek" | "qwen" | "doubao" | "gemini" | "glm";

const providerSchema = z.enum(["deepseek", "qwen", "doubao", "gemini", "glm"]);

const idSchema = z.string().trim().min(1, "模型 ID 不能为空");
const providerModelIdSchema = z.string().trim().min(1, "模型标识不能为空");

const updateModelInputSchema = z.object({
  id             : idSchema,
  providerModelId: providerModelIdSchema.optional(),
  baseUrl        : z.string().trim().min(1, "BaseURL 不能为空").optional(),
  isEnabled      : z.boolean().optional(),
  apiKey         : z.discriminatedUnion("action", [
    z.object({
      action: z.literal("unchanged")
    }),
    z.object({
      action: z.literal("clear")
    }),
    z.object({
      action: z.literal("set"),
      value : z.string().trim().min(1, "API Key 不能为空")
    })
  ]).optional()
});

/**
 * 数据库层模型记录快照（内部结构，不直接暴露给前端）。
 * 字段语义强调“存储真实值”，例如 `apiKey` 可能是加密密文。
 */
interface AiModelRecord {
  /** 模型记录主键 ID。 */
  id       : string;
  /** 提供商标识（deepseek/qwen/...）。 */
  provider : string;
  /** 管理端展示名称。 */
  name     : string;
  /** 提供商侧模型 ID（真实调用使用）。 */
  modelId  : string;
  /** 别名键（用于推荐与策略映射，可为空）。 */
  aliasKey : string | null;
  /** 提供商 API Base URL。 */
  baseUrl  : string;
  /** 密钥（存储层可为空；存在时通常为加密串）。 */
  apiKey   : string | null;
  /** 是否启用。 */
  isEnabled: boolean;
  /** 是否全局默认模型。 */
  isDefault: boolean;
  /** 最近更新时间（用于缓存与变更追踪）。 */
  updatedAt: Date;
}

export interface ModelPerformanceRatings {
  /** 速度评分（由平台策略计算，用于前端推荐展示）。 */
  speed    : number;
  /** 稳定性评分（综合失败率/超时等信号）。 */
  stability: number;
  /** 成本评分（相对值，越高表示越经济）。 */
  cost     : number;
}

export interface ModelPerformanceSnapshot {
  /** 统计窗口内调用次数。 */
  callCount          : number;
  /** 成功率（无数据时为 null，避免误导为 0）。 */
  successRate        : number | null;
  /** 平均延迟（毫秒，缺样本时为 null）。 */
  avgLatencyMs       : number | null;
  /** 平均输入 token（缺样本时为 null）。 */
  avgPromptTokens    : number | null;
  /** 平均输出 token（缺样本时为 null）。 */
  avgCompletionTokens: number | null;
  /** 面向管理端展示的可读评分。 */
  ratings            : ModelPerformanceRatings;
}

export interface ModelListItem {
  /** 模型 ID。 */
  id             : string;
  /** 提供商。 */
  provider       : "deepseek" | "qwen" | "doubao" | "gemini" | "glm";
  /** 管理台显示名。 */
  name           : string;
  /** 提供商模型标识。 */
  providerModelId: string;
  /** 推荐/策略别名。 */
  aliasKey       : string | null;
  /** 调用基地址。 */
  baseUrl        : string;
  /** 是否启用。 */
  isEnabled      : boolean;
  /** 是否默认。 */
  isDefault      : boolean;
  /** 脱敏后的密钥（仅供回显状态，不可用于调用）。 */
  apiKeyMasked   : string | null;
  /** 是否完成可调用配置（baseUrl + apiKey 等）。 */
  isConfigured   : boolean;
  /** 性能快照。 */
  performance    : ModelPerformanceSnapshot;
  /** ISO 时间字符串，便于前端直接显示。 */
  updatedAt      : string;
}

export type ApiKeyChange =
  | { action: "unchanged" }
  | { action: "clear" }
  | { action: "set"; value: string };

export interface UpdateModelInput {
  /** 目标模型 ID。 */
  providerModelId?: string;
  /** 被更新的记录 ID。 */
  id              : string;
  /** 新 baseUrl。 */
  baseUrl?        : string;
  /** 新启停状态。 */
  isEnabled?      : boolean;
  /** 密钥变更动作（不变/清空/设置）。 */
  apiKey?         : ApiKeyChange;
}

export interface UpdateAdminModelPayload {
  /** 可选覆盖的 providerModelId。 */
  providerModelId?: string;
  /** 可选覆盖的 baseUrl。 */
  baseUrl?        : string;
  /** 可选启停状态。 */
  isEnabled?      : boolean;
  /** 管理端输入的明文密钥；null 表示显式清空。 */
  apiKey?         : string | null;
}

export type ModelConnectivityErrorType =
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT";

export interface ModelConnectivityResult {
  /** 连通性是否成功。 */
  success      : boolean;
  /** 请求耗时（成功时返回）。 */
  latencyMs?   : number;
  /** 人可读结果描述（用于前端提示）。 */
  detail       : string;
  /** 错误分类（失败时返回，供界面差异化提示）。 */
  errorType?   : ModelConnectivityErrorType;
  /** 详细错误信息（调试用途）。 */
  errorMessage?: string;
}

const modelSelect = {
  id       : true,
  provider : true,
  name     : true,
  modelId  : true,
  aliasKey : true,
  baseUrl  : true,
  apiKey   : true,
  isEnabled: true,
  isDefault: true,
  updatedAt: true
} as const;

const FINAL_MODEL_CALL_STATUSES = ["SUCCESS", "ERROR"] as const;
const EMPTY_PERFORMANCE_SNAPSHOT: ModelPerformanceSnapshot = {
  callCount          : 0,
  successRate        : null,
  avgLatencyMs       : null,
  avgPromptTokens    : null,
  avgCompletionTokens: null,
  ratings            : {
    speed    : 0,
    stability: 0,
    cost     : 0
  }
};

/**
 * 功能：统一清理 BaseURL 末尾 `/`，避免拼接 endpoint 时出现双斜杠。
 * 输入：baseUrl。
 * 输出：规范化 URL 字符串。
 * 异常：无。
 * 副作用：无。
 */
function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.trim().replace(/\/+$/, "");
}

function clampRating(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(5, Math.round(value)));
}

function toInverseRangeRating(value: number, min: number, max: number): number {
  if (max <= min) {
    return 3;
  }

  const ratio = (value - min) / (max - min);
  return clampRating((1 - ratio) * 4 + 1);
}

function toSuccessRateRating(successRate: number): number {
  return clampRating(successRate * 4 + 1);
}

/**
 * 功能：读取数据库中的 API Key 并按需解密。
 * 输入：数据库 `api_key` 字段（仅允许 null 或 `enc:v1:` 密文）。
 * 输出：可用于 provider 请求的明文 Key（仅在服务端内存中短暂使用）。
 * 异常：密文格式不合法或解密失败时抛错。
 * 副作用：无。
 */
function readStoredApiKey(apiKey: string | null): string | null {
  if (!apiKey) {
    return null;
  }

  if (!apiKey.startsWith("enc:v1:")) {
    throw new Error("检测到非法 API Key 存储格式，请在模型设置页重新保存");
  }

  return decryptValue(apiKey);
}

/**
 * 功能：将数据库模型记录映射为管理端安全输出模型。
 * 输入：AiModelRecord。
 * 输出：脱敏后的 ModelListItem（不暴露明文 Key）。
 * 异常：provider 非受支持值时由 zod 抛错。
 * 副作用：无。
 */
function toModelListItem(
  model: AiModelRecord,
  performance: ModelPerformanceSnapshot = EMPTY_PERFORMANCE_SNAPSHOT
): ModelListItem {
  const plainApiKey = readStoredApiKey(model.apiKey);

  return {
    id             : model.id,
    provider       : providerSchema.parse(model.provider.toLowerCase()),
    name           : model.name,
    providerModelId: model.modelId,
    aliasKey       : model.aliasKey,
    baseUrl        : model.baseUrl,
    isEnabled      : model.isEnabled,
    isDefault      : model.isDefault,
    apiKeyMasked   : maskSensitiveValue(plainApiKey),
    isConfigured   : Boolean(plainApiKey),
    performance,
    updatedAt      : model.updatedAt.toISOString()
  };
}

export function createModelsModule(
  prismaClient: PrismaClient,
  fetchImpl: FetchImpl = fetch
) {
  async function getModelRecord(id: string): Promise<AiModelRecord> {
    const model = await prismaClient.aiModel.findUnique({
      where : { id },
      select: modelSelect
    });

    if (!model) {
      throw new Error("模型不存在");
    }

    return model;
  }

  async function buildModelPerformanceMap(modelIds: string[]): Promise<Map<string, ModelPerformanceSnapshot>> {
    if (modelIds.length === 0) {
      return new Map();
    }

    const [statusBuckets, successBuckets] = await Promise.all([
      prismaClient.analysisPhaseLog.groupBy({
        by   : ["modelId", "status"],
        where: {
          modelId: { in: modelIds },
          status : { in: [...FINAL_MODEL_CALL_STATUSES] }
        },
        _count: { _all: true }
      }),
      prismaClient.analysisPhaseLog.groupBy({
        by   : ["modelId"],
        where: {
          modelId: { in: modelIds },
          status : "SUCCESS"
        },
        _count: { _all: true },
        _avg  : {
          durationMs      : true,
          promptTokens    : true,
          completionTokens: true
        }
      })
    ]);

    const totalsByModel = new Map<string, { totalCalls: number; successCalls: number }>();
    for (const bucket of statusBuckets) {
      if (!bucket.modelId) {
        continue;
      }

      const current = totalsByModel.get(bucket.modelId) ?? { totalCalls: 0, successCalls: 0 };
      current.totalCalls += bucket._count._all;
      if (bucket.status === "SUCCESS") {
        current.successCalls += bucket._count._all;
      }
      totalsByModel.set(bucket.modelId, current);
    }

    const successByModel = new Map<string, {
      avgLatencyMs       : number | null;
      avgPromptTokens    : number | null;
      avgCompletionTokens: number | null;
    }>();
    for (const bucket of successBuckets) {
      if (!bucket.modelId) {
        continue;
      }

      successByModel.set(bucket.modelId, {
        avgLatencyMs       : bucket._avg.durationMs ?? null,
        avgPromptTokens    : bucket._avg.promptTokens ?? null,
        avgCompletionTokens: bucket._avg.completionTokens ?? null
      });
    }

    const rawByModel = new Map<string, {
      callCount          : number;
      successRate        : number | null;
      avgLatencyMs       : number | null;
      avgPromptTokens    : number | null;
      avgCompletionTokens: number | null;
      avgTotalTokens     : number | null;
    }>();

    for (const modelId of modelIds) {
      const totals = totalsByModel.get(modelId);
      const success = successByModel.get(modelId);
      const avgPromptTokens = success?.avgPromptTokens ?? null;
      const avgCompletionTokens = success?.avgCompletionTokens ?? null;
      const avgTotalTokens = avgPromptTokens === null && avgCompletionTokens === null
        ? null
        : (avgPromptTokens ?? 0) + (avgCompletionTokens ?? 0);

      rawByModel.set(modelId, {
        callCount   : totals?.totalCalls ?? 0,
        successRate : totals && totals.totalCalls > 0 ? totals.successCalls / totals.totalCalls : null,
        avgLatencyMs: success?.avgLatencyMs ?? null,
        avgPromptTokens,
        avgCompletionTokens,
        avgTotalTokens
      });
    }

    const latencyValues = Array.from(rawByModel.values())
      .map((item) => item.avgLatencyMs)
      .filter((value): value is number => typeof value === "number");
    const tokenValues = Array.from(rawByModel.values())
      .map((item) => item.avgTotalTokens)
      .filter((value): value is number => typeof value === "number");

    const latencyMin = latencyValues.length > 0 ? Math.min(...latencyValues) : 0;
    const latencyMax = latencyValues.length > 0 ? Math.max(...latencyValues) : 0;
    const tokenMin = tokenValues.length > 0 ? Math.min(...tokenValues) : 0;
    const tokenMax = tokenValues.length > 0 ? Math.max(...tokenValues) : 0;

    const performanceMap = new Map<string, ModelPerformanceSnapshot>();
    for (const [modelId, raw] of rawByModel.entries()) {
      performanceMap.set(modelId, {
        callCount          : raw.callCount,
        successRate        : raw.successRate,
        avgLatencyMs       : raw.avgLatencyMs,
        avgPromptTokens    : raw.avgPromptTokens,
        avgCompletionTokens: raw.avgCompletionTokens,
        ratings            : {
          speed    : raw.avgLatencyMs === null ? 0 : toInverseRangeRating(raw.avgLatencyMs, latencyMin, latencyMax),
          stability: raw.successRate === null ? 0 : toSuccessRateRating(raw.successRate),
          cost     : raw.avgTotalTokens === null ? 0 : toInverseRangeRating(raw.avgTotalTokens, tokenMin, tokenMax)
        }
      });
    }

    return performanceMap;
  }

  async function listModels(): Promise<ModelListItem[]> {
    const models = await prismaClient.aiModel.findMany({
      orderBy: [
        { isDefault: "desc" },
        { updatedAt: "desc" }
      ],
      select: modelSelect
    });

    const performanceByModelId = await buildModelPerformanceMap(models.map((model) => model.id));
    return models.map((model) => toModelListItem(model, performanceByModelId.get(model.id) ?? EMPTY_PERFORMANCE_SNAPSHOT));
  }

  async function updateModel(input: UpdateModelInput): Promise<ModelListItem> {
    const parsedInput = updateModelInputSchema.parse(input);
    const currentModel = await getModelRecord(parsedInput.id);

    const nextProviderModelId = parsedInput.providerModelId ?? currentModel.modelId;
    const nextBaseUrl = parsedInput.baseUrl ? normalizeBaseUrl(parsedInput.baseUrl) : currentModel.baseUrl;

    let nextEncryptedApiKey = currentModel.apiKey;
    let isConfigured = Boolean(readStoredApiKey(currentModel.apiKey));

    if (parsedInput.apiKey?.action === "set") {
      nextEncryptedApiKey = encryptValue(parsedInput.apiKey.value.trim());
      isConfigured = true;
    }

    if (parsedInput.apiKey?.action === "clear") {
      nextEncryptedApiKey = null;
      isConfigured = false;
    }

    const nextIsEnabled = parsedInput.isEnabled ?? currentModel.isEnabled;
    if (nextIsEnabled && !isConfigured) {
      throw new Error("启用模型前请先配置 API Key");
    }

    const updatedModel = await prismaClient.aiModel.update({
      where: { id: parsedInput.id },
      data : {
        modelId  : nextProviderModelId,
        baseUrl  : nextBaseUrl,
        isEnabled: nextIsEnabled,
        ...(parsedInput.apiKey ? { apiKey: nextEncryptedApiKey } : {})
      },
      select: modelSelect
    });

    return toModelListItem(updatedModel);
  }

  async function setDefaultModel(id: string): Promise<ModelListItem> {
    const parsedId = idSchema.parse(id);

    const updatedModel = await prismaClient.$transaction(async (tx) => {
      const existingModel = await tx.aiModel.findUnique({
        where : { id: parsedId },
        select: { id: true }
      });

      if (!existingModel) {
        throw new Error("模型不存在");
      }

      await tx.aiModel.updateMany({
        where: { isDefault: true },
        data : { isDefault: false }
      });

      return tx.aiModel.update({
        where : { id: parsedId },
        data  : { isDefault: true },
        select: modelSelect
      });
    });

    return toModelListItem(updatedModel);
  }

  async function testModelConnectivity(id: string): Promise<ModelConnectivityResult> {
    const parsedId = idSchema.parse(id);
    const model = await getModelRecord(parsedId);
    const provider = providerSchema.parse(model.provider.toLowerCase());
    const apiKey = readStoredApiKey(model.apiKey);

    if (!apiKey) {
      throw new Error("模型未配置 API Key");
    }

    const baseUrl = normalizeBaseUrl(model.baseUrl);
    assertConnectivityBaseUrlAllowed(provider, baseUrl);
    const startedAt = Date.now();

    try {
      let response: Response;

      if (provider === "gemini") {
        // Gemini 走 generateContent 且使用 query-string key，与 OpenAI 兼容接口不同。
        response = await fetchImpl(
          `${baseUrl}/v1beta/models/${model.modelId}:generateContent?key=${encodeURIComponent(apiKey)}`,
          {
            method : "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              contents        : [{ role: "user", parts: [{ text: "ping" }] }],
              generationConfig: {
                temperature    : 0,
                maxOutputTokens: 1
              }
            })
          }
        );
      } else {
        // DeepSeek/Qwen/Doubao/GLM 统一按 OpenAI-compatible chat/completions 最小请求探活。
        response = await fetchImpl(`${baseUrl}/chat/completions`, {
          method : "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization : `Bearer ${apiKey}`
          },
          body: JSON.stringify({
            model      : model.modelId,
            temperature: 0,
            max_tokens : 1,
            messages   : [{ role: "user", content: "ping" }]
          })
        });
      }

      const latencyMs = Date.now() - startedAt;
      const { detail, payload } = await extractResponseDetail(response, response.ok ? "连接成功" : `HTTP ${response.status}`);

      if (!response.ok) {
        const errorType = classifyHttpErrorType(response.status);
        return {
          success     : false,
          latencyMs,
          detail,
          errorType,
          errorMessage: detail
        };
      }

      if (provider !== "gemini") {
        const semanticResult = validateOpenAiCompatibleProbePayload(payload);
        if (!semanticResult.success) {
          const semanticDetail = semanticResult.detail ?? detail;
          return {
            success     : false,
            latencyMs,
            detail      : semanticDetail,
            errorType   : classifySemanticErrorType(semanticDetail),
            errorMessage: semanticDetail
          };
        }
      }

      return {
        success: true,
        latencyMs,
        detail : "连接成功"
      };
    } catch (error) {
      const detail = getErrorMessage(error, "模型连通性测试失败");

      return {
        success     : false,
        latencyMs   : Date.now() - startedAt,
        detail,
        errorType   : classifyThrownErrorType(error),
        errorMessage: detail
      };
    }
  }

  return {
    listModels,
    updateModel,
    setDefaultModel,
    testModelConnectivity
  };
}


// ── Admin adapters (re-exported for backward compatibility) ──────────────
export {
  listAdminModels,
  listModels,
  setDefaultAdminModel,
  setDefaultModel,
  testAdminModelConnection,
  testModelConnectivity,
  updateAdminModel,
  updateModel
} from "./admin-adapters";
