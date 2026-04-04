import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import { decryptValue, encryptValue, maskSensitiveValue } from "@/server/security/encryption";

type FetchImpl = typeof fetch;
type SupportedProvider = "deepseek" | "qwen" | "doubao" | "gemini" | "glm";

const providerSchema = z.enum(["deepseek", "qwen", "doubao", "gemini", "glm"]);

const idSchema = z.string().trim().min(1, "模型 ID 不能为空");

const updateModelInputSchema = z.object({
  id       : idSchema,
  modelId  : z.string().trim().min(1, "模型标识不能为空").optional(),
  baseUrl  : z.string().trim().min(1, "BaseURL 不能为空").optional(),
  isEnabled: z.boolean().optional(),
  apiKey   : z.discriminatedUnion("action", [
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

interface AiModelRecord {
  id       : string;
  provider : string;
  name     : string;
  modelId  : string;
  baseUrl  : string;
  apiKey   : string | null;
  isEnabled: boolean;
  isDefault: boolean;
  updatedAt: Date;
}

export interface ModelPerformanceRatings {
  speed    : number;
  stability: number;
  cost     : number;
}

export interface ModelPerformanceSnapshot {
  callCount          : number;
  successRate        : number | null;
  avgLatencyMs       : number | null;
  avgPromptTokens    : number | null;
  avgCompletionTokens: number | null;
  ratings            : ModelPerformanceRatings;
}

export interface ModelListItem {
  id          : string;
  provider    : "deepseek" | "qwen" | "doubao" | "gemini" | "glm";
  name        : string;
  modelId     : string;
  baseUrl     : string;
  isEnabled   : boolean;
  isDefault   : boolean;
  apiKeyMasked: string | null;
  isConfigured: boolean;
  performance : ModelPerformanceSnapshot;
  updatedAt   : string;
}

export type ApiKeyChange =
  | { action: "unchanged" }
  | { action: "clear" }
  | { action: "set"; value: string };

export interface UpdateModelInput {
  modelId?  : string;
  id        : string;
  baseUrl?  : string;
  isEnabled?: boolean;
  apiKey?   : ApiKeyChange;
}

export interface UpdateAdminModelPayload {
  modelId?  : string;
  baseUrl?  : string;
  isEnabled?: boolean;
  apiKey?   : string | null;
}

export type ModelConnectivityErrorType =
  | "NETWORK_ERROR"
  | "AUTH_ERROR"
  | "MODEL_UNAVAILABLE"
  | "TIMEOUT";

export interface ModelConnectivityResult {
  success      : boolean;
  latencyMs?   : number;
  detail       : string;
  errorType?   : ModelConnectivityErrorType;
  errorMessage?: string;
}

const modelSelect = {
  id       : true,
  provider : true,
  name     : true,
  modelId  : true,
  baseUrl  : true,
  apiKey   : true,
  isEnabled: true,
  isDefault: true,
  updatedAt: true
} as const;

const connectivityHostAllowList: Record<SupportedProvider, readonly string[]> = {
  deepseek: ["api.deepseek.com", "dashscope.aliyuncs.com"],
  qwen    : ["dashscope.aliyuncs.com"],
  doubao  : ["ark.cn-beijing.volces.com"],
  gemini  : ["generativelanguage.googleapis.com"],
  glm     : ["open.bigmodel.cn"]
};

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
 * 功能：解析额外连通性测试白名单域名（逗号分隔）。
 * 输入：`MODEL_TEST_ALLOWED_HOSTS` 原始环境变量字符串。
 * 输出：去重前的标准化域名数组（小写、trim 后）。
 * 异常：无。
 * 副作用：无。
 */
function parseExtraConnectivityHosts(raw: string | undefined): string[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter((item) => item.length > 0);
}

/**
 * 功能：判断目标域名是否命中允许列表。
 * 输入：hostname 与 allowList。
 * 输出：布尔值，true 表示允许发起连通性请求。
 * 异常：无。
 * 副作用：无。
 */
function isAllowedHost(hostname: string, allowList: readonly string[]): boolean {
  const normalizedHost = hostname.toLowerCase();
  return allowList.some((allowedHost) => normalizedHost === allowedHost.toLowerCase());
}

/**
 * 功能：对连通性测试 BaseURL 做安全边界校验（协议 + 域名白名单）。
 * 输入：provider、baseUrl。
 * 输出：void，校验通过即允许继续请求。
 * 异常：BaseURL 非法、非 HTTPS、域名不在白名单时抛错。
 * 副作用：无。
 */
function assertConnectivityBaseUrlAllowed(provider: SupportedProvider, baseUrl: string): void {
  let parsedBaseUrl: URL;

  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    throw new Error("BaseURL 不合法");
  }

  if (parsedBaseUrl.protocol !== "https:") {
    throw new Error("连通性测试仅支持 HTTPS BaseURL");
  }

  const allowList = [
    ...connectivityHostAllowList[provider],
    ...parseExtraConnectivityHosts(process.env.MODEL_TEST_ALLOWED_HOSTS)
  ];

  if (!isAllowedHost(parsedBaseUrl.hostname, allowList)) {
    throw new Error("连通性测试地址不在白名单内");
  }
}

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
    id          : model.id,
    provider    : providerSchema.parse(model.provider.toLowerCase()),
    name        : model.name,
    modelId     : model.modelId,
    baseUrl     : model.baseUrl,
    isEnabled   : model.isEnabled,
    isDefault   : model.isDefault,
    apiKeyMasked: maskSensitiveValue(plainApiKey),
    isConfigured: Boolean(plainApiKey),
    performance,
    updatedAt   : model.updatedAt.toISOString()
  };
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * 功能：根据 HTTP 状态码归类模型连通性失败类型，供前端做稳定文案分支。
 * 输入：status（HTTP 响应状态码）。
 * 输出：标准错误类型枚举。
 * 异常：无。
 * 副作用：无。
 */
function classifyHttpErrorType(status: number): ModelConnectivityErrorType {
  if (status === 401 || status === 403) {
    return "AUTH_ERROR";
  }

  if (status === 408 || status === 504) {
    return "TIMEOUT";
  }

  if (status === 404 || status === 429 || status >= 500) {
    return "MODEL_UNAVAILABLE";
  }

  return "NETWORK_ERROR";
}

/**
 * 功能：根据抛错信息兜底识别失败类型（如超时、网络层异常）。
 * 输入：unknown error。
 * 输出：标准错误类型枚举。
 * 异常：无。
 * 副作用：无。
 */
function classifyThrownErrorType(error: unknown): ModelConnectivityErrorType {
  if (error instanceof DOMException && error.name === "AbortError") {
    return "TIMEOUT";
  }

  const message = getErrorMessage(error, "").toLowerCase();
  if (message.includes("timeout")) {
    return "TIMEOUT";
  }

  if (message.includes("network") || message.includes("fetch")) {
    return "NETWORK_ERROR";
  }

  return "NETWORK_ERROR";
}

function classifySemanticErrorType(detail: string): ModelConnectivityErrorType {
  const normalized = detail.toLowerCase();
  if (
    normalized.includes("api key")
    || normalized.includes("unauthorized")
    || normalized.includes("forbidden")
    || normalized.includes("鉴权")
    || normalized.includes("令牌")
  ) {
    return "AUTH_ERROR";
  }

  return "MODEL_UNAVAILABLE";
}

function hasOpenAiCompatibleMessage(payload: Record<string, unknown>): boolean {
  const choices = payload.choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    return false;
  }

  const firstChoice: unknown = choices[0];
  if (!isRecord(firstChoice)) {
    return false;
  }

  const message = firstChoice.message;
  if (!isRecord(message)) {
    return false;
  }

  const content = message.content;
  if (typeof content === "string") {
    return true;
  }

  if (!Array.isArray(content)) {
    return false;
  }

  return content.some((part) => {
    if (!isRecord(part)) {
      return false;
    }

    return typeof part.text === "string";
  });
}

function validateOpenAiCompatibleProbePayload(payload: Record<string, unknown> | null): {
  success: boolean;
  detail?: string;
} {
  if (!payload) {
    return {
      success: false,
      detail : "响应不是合法 JSON，无法确认模型可用"
    };
  }

  const payloadError = payload.error;
  if (isRecord(payloadError) && typeof payloadError.message === "string" && payloadError.message.trim().length > 0) {
    return {
      success: false,
      detail : payloadError.message
    };
  }

  if (!Array.isArray(payload.choices) || payload.choices.length === 0) {
    return {
      success: false,
      detail : "响应缺少 choices，无法确认模型可用"
    };
  }

  if (!hasOpenAiCompatibleMessage(payload)) {
    return {
      success: false,
      detail : "响应缺少可读内容，无法确认模型可用"
    };
  }

  return { success: true };
}

interface ExtractedResponseDetail {
  detail : string;
  payload: Record<string, unknown> | null;
}

/**
 * 功能：提取 provider 返回中的可读错误信息，统一返回给管理端测试弹窗。
 * 输入：response、fallback。
 * 输出：优先级为 `error.message` > `message` > `text` > fallback。
 * 异常：解析失败时吞掉异常并回退 fallback。
 * 副作用：消耗一次 response body 读取流。
 */
async function extractResponseDetail(response: Response, fallback: string): Promise<ExtractedResponseDetail> {
  const contentType = response.headers.get("content-type") ?? "";

  try {
    if (contentType.includes("application/json")) {
      const rawPayload: unknown = await response.json();
      if (!isRecord(rawPayload)) {
        return {
          detail : fallback,
          payload: null
        };
      }

      const payloadError = rawPayload.error;
      if (isRecord(payloadError) && typeof payloadError.message === "string" && payloadError.message.trim().length > 0) {
        return {
          detail : payloadError.message,
          payload: rawPayload
        };
      }

      if (typeof rawPayload.message === "string" && rawPayload.message.trim().length > 0) {
        return {
          detail : rawPayload.message,
          payload: rawPayload
        };
      }

      return {
        detail : fallback,
        payload: rawPayload
      };
    } else {
      const rawText = await response.text();
      if (rawText.trim()) {
        return {
          detail : rawText.trim().slice(0, 200),
          payload: null
        };
      }
    }
  } catch {
    return {
      detail : fallback,
      payload: null
    };
  }

  return {
    detail : fallback,
    payload: null
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

    const nextModelId = parsedInput.modelId ?? currentModel.modelId;
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
        modelId  : nextModelId,
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

async function getDefaultModelsModule() {
  const { prisma } = await import("@/server/db/prisma");
  return createModelsModule(prisma, fetch);
}

export async function listModels(): Promise<ModelListItem[]> {
  return (await getDefaultModelsModule()).listModels();
}

export async function updateModel(input: UpdateModelInput): Promise<ModelListItem> {
  return (await getDefaultModelsModule()).updateModel(input);
}

export async function setDefaultModel(id: string): Promise<ModelListItem> {
  return (await getDefaultModelsModule()).setDefaultModel(id);
}

export async function testModelConnectivity(id: string): Promise<ModelConnectivityResult> {
  return (await getDefaultModelsModule()).testModelConnectivity(id);
}

function toApiKeyChange(apiKey: string | null | undefined): ApiKeyChange | undefined {
  if (typeof apiKey === "undefined") {
    return { action: "unchanged" };
  }

  if (apiKey === null) {
    return { action: "clear" };
  }

  const trimmedApiKey = apiKey.trim();
  if (!trimmedApiKey) {
    return { action: "unchanged" };
  }

  return {
    action: "set",
    value : trimmedApiKey
  };
}

/**
 * Admin route adapters: keep route layer contract stable while内部仍复用核心 models module。
 */
export async function listAdminModels(): Promise<ModelListItem[]> {
  return listModels();
}

export async function updateAdminModel(
  id: string,
  payload: UpdateAdminModelPayload
): Promise<ModelListItem> {
  return updateModel({
    id,
    modelId  : payload.modelId,
    baseUrl  : payload.baseUrl,
    isEnabled: payload.isEnabled,
    apiKey   : toApiKeyChange(payload.apiKey)
  });
}

export async function setDefaultAdminModel(id: string): Promise<ModelListItem> {
  return setDefaultModel(id);
}

export async function testAdminModelConnection(id: string): Promise<ModelConnectivityResult> {
  return testModelConnectivity(id);
}
