/**
 * 功能点模型服务（feature_models 域）
 * =============================================================================
 * 文件定位：`src/server/modules/models/featureModels.ts`
 *
 * v5 模型策略（阶段 4）：9 阶段矩阵（model_strategy_configs）已删除，改为“功能点 → 模型”
 * 全局映射。每个功能点（SKILL_SELECTOR / PIPELINE_MAIN / REVIEW）指定一个模型；未配置时由
 * AiCallExecutor 回退到系统默认模型（isDefault 或第一个启用模型）。
 *
 * 职责：
 * - `getFeatureModel`：运行时解析功能点模型（带解密 API Key），供 AiCallExecutor 消费；
 * - `loadSystemDefaultModel`：系统默认模型解析（isDefault 优先，否则最近更新的启用模型）；
 * - `upsertFeatureModel`：管理端维护功能点映射，带 AiModel 存在性与启停校验；
 * - `listFeatureModels`：管理端列表（含未配置功能点，不暴露 API Key）。
 */
import type { AiModel, PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";
import type { AiProviderProtocol } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";
import { FEATURE_KEYS, type FeatureKey } from "@/types/pipeline";

/** 模型来源语义：功能点映射 / 系统默认 / 兜底降级。 */
export type FeatureModelSource = "FEATURE" | "SYSTEM_DEFAULT" | "FALLBACK";

/** AI 调用参数（v5 无 per-stage 参数，统一使用默认档位）。 */
export interface AiCallParams {
  /** 单功能点最大重试次数（不含首次请求）。 */
  maxRetries : number;
  /** 重试基准退避时间（毫秒）。 */
  retryBaseMs: number;
}

/** 统一默认调用参数。 */
export const DEFAULT_AI_CALL_PARAMS: AiCallParams = {
  maxRetries : 2,
  retryBaseMs: 600
};

/** 运行时解析出的可执行模型配置（含解密密钥，仅存在于调用链，不写日志）。 */
export interface ResolvedFeatureModel {
  /** 模型记录 ID。 */
  modelId    : string;
  /** 归一化 provider。 */
  provider   : string;
  /** provider 调用协议。 */
  protocol   : AiProviderProtocol;
  /** provider 侧模型标识。 */
  modelName  : string;
  /** 展示名（便于日志与管理端展示）。 */
  displayName: string;
  /** 请求基地址。 */
  baseUrl    : string;
  /** 解密后的调用密钥。 */
  apiKey     : string;
  /** 来源（FEATURE / SYSTEM_DEFAULT / FALLBACK）。 */
  source     : FeatureModelSource;
  /** 调用参数（重试档位）。 */
  params     : AiCallParams;
}

/** 管理端列表项（不含 API Key）。 */
export interface FeatureModelAdminItem {
  /** 功能点键。 */
  featureKey  : FeatureKey;
  /** 映射的模型 ID；未配置时为 null。 */
  modelId     : string | null;
  /** 模型展示名。 */
  modelName   : string | null;
  /** 模型 provider。 */
  provider    : string | null;
  /** 是否已配置有效映射。 */
  isConfigured: boolean;
  /** 更新时间（ISO 字符串）；未配置时为 null。 */
  updatedAt   : string | null;
}

/**
 * 功能点模型校验/操作错误。
 */
export class FeatureModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureModelError";
  }
}

/** 从 AiModel 记录读取并解密密文 Key。 */
function readEncryptedApiKey(apiKey: string | null, modelName: string): string {
  if (!apiKey) {
    throw new FeatureModelError(`模型「${modelName}」未配置 API Key`);
  }

  if (!apiKey.startsWith("enc:v1:")) {
    throw new FeatureModelError(`模型「${modelName}」API Key 存储格式非法，请在模型设置页重新保存`);
  }

  return decryptValue(apiKey);
}

/** 把数据库 protocol 值规范化为受支持的协议枚举。 */
function normalizeProtocol(protocol: string): AiProviderProtocol {
  if (protocol === "openai-compatible" || protocol === "gemini") {
    return protocol;
  }
  throw new FeatureModelError(`不支持的模型协议: ${protocol}`);
}

/**
 * 功能：把 AiModel 记录转换为运行时可执行模型配置。
 * 输入：AiModel 记录、来源与调用参数。
 * 输出：`ResolvedFeatureModel`。
 * 异常：缺失/非法 API Key、协议不支持时抛 `FeatureModelError`。
 * 副作用：无。
 */
export function toResolvedFeatureModel(
  model: AiModel,
  source: FeatureModelSource,
  params: AiCallParams = DEFAULT_AI_CALL_PARAMS
): ResolvedFeatureModel {
  return {
    modelId    : model.id,
    provider   : model.provider,
    protocol   : normalizeProtocol(model.protocol),
    modelName  : model.modelId,
    displayName: model.name,
    baseUrl    : model.baseUrl,
    apiKey     : readEncryptedApiKey(model.apiKey, model.name),
    source,
    params
  };
}

/** AiModel 记录选择字段（运行时解析所需）。 */
const runtimeModelSelect = {
  id       : true,
  provider : true,
  protocol : true,
  name     : true,
  modelId  : true,
  baseUrl  : true,
  apiKey   : true,
  isEnabled: true,
  isDefault: true
} as const;

/**
 * 功能：解析功能点对应的运行时模型。
 * 输入：功能点键。
 * 输出：可执行模型配置；未配置或模型停用时返回 null。
 * 异常：模型存在但 API Key 缺失/非法时抛 `FeatureModelError`。
 * 副作用：读取数据库。
 */
export async function getFeatureModel(
  featureKey: FeatureKey,
  prismaClient: PrismaClient = prisma
): Promise<ResolvedFeatureModel | null> {
  const config = await prismaClient.featureModelConfig.findUnique({
    where : { featureKey },
    select: {
      modelId: true,
      model  : {
        select: runtimeModelSelect
      }
    }
  });

  // 未配置映射或所指向模型已停用 → 视为“该功能点未配置”，由调用方回退系统默认。
  if (!config || !config.model.isEnabled) {
    return null;
  }

  return toResolvedFeatureModel(config.model as AiModel, "FEATURE");
}

/**
 * 功能：解析系统默认模型（优先 isDefault，否则取最近更新的启用模型）。
 * 输入：prisma 客户端。
 * 输出：可执行模型配置（source=SYSTEM_DEFAULT）。
 * 异常：系统无任何启用模型时抛错。
 * 副作用：读取数据库。
 */
export async function loadSystemDefaultModel(
  prismaClient: PrismaClient = prisma
): Promise<ResolvedFeatureModel> {
  const defaultModel = await prismaClient.aiModel.findFirst({
    where  : { isEnabled: true, isDefault: true },
    orderBy: { updatedAt: "desc" },
    select : runtimeModelSelect
  });
  const model = defaultModel ?? await prismaClient.aiModel.findFirst({
    where  : { isEnabled: true },
    orderBy: { updatedAt: "desc" },
    select : runtimeModelSelect
  });

  if (!model) {
    throw new FeatureModelError("未找到可用模型，请在 /admin/model 配置并启用至少一个模型");
  }

  return toResolvedFeatureModel(model as AiModel, "SYSTEM_DEFAULT");
}

/**
 * 功能：维护功能点 → 模型 的全局映射。
 * 输入：功能点键、模型 ID（null 表示清除该功能点配置）。
 * 输出：无。
 * 异常：modelId 非 null 且模型不存在/未启用时抛 `FeatureModelError`。
 * 副作用：写入 `feature_models`（upsert）。
 */
export async function upsertFeatureModel(
  featureKey: FeatureKey,
  modelId: string | null,
  prismaClient: PrismaClient = prisma
): Promise<void> {
  if (!modelId) {
    await prismaClient.featureModelConfig.deleteMany({ where: { featureKey } });
    return;
  }

  const model = await prismaClient.aiModel.findUnique({
    where : { id: modelId },
    select: { id: true, isEnabled: true }
  });
  if (!model) {
    throw new FeatureModelError("功能点模型不存在");
  }
  if (!model.isEnabled) {
    throw new FeatureModelError("功能点模型未启用，请先在模型管理中启用");
  }

  await prismaClient.featureModelConfig.upsert({
    where : { featureKey },
    create: { featureKey, modelId },
    update: { modelId },
    select: { featureKey: true }
  });
}

/**
 * 功能：返回全部功能点及其模型映射（含未配置项），供管理端展示。
 * 输入：prisma 客户端。
 * 输出：`FeatureModelAdminItem[]`（固定 3 个功能点顺序）。
 * 异常：数据库异常向上抛出。
 * 副作用：读取数据库。
 */
export async function listFeatureModels(
  prismaClient: PrismaClient = prisma
): Promise<FeatureModelAdminItem[]> {
  const configs = await prismaClient.featureModelConfig.findMany({
    select: {
      featureKey: true,
      modelId   : true,
      updatedAt : true,
      model     : {
        select: {
          name     : true,
          provider : true,
          isEnabled: true
        }
      }
    }
  });

  const configMap = new Map(configs.map((config) => [config.featureKey, config]));

  return FEATURE_KEYS.map((featureKey) => {
    const config = configMap.get(featureKey);
    if (!config || !config.model.isEnabled) {
      return {
        featureKey,
        modelId     : null,
        modelName   : null,
        provider    : null,
        isConfigured: false,
        updatedAt   : null
      };
    }

    return {
      featureKey,
      modelId     : config.modelId,
      modelName   : config.model.name,
      provider    : config.model.provider,
      isConfigured: true,
      updatedAt   : config.updatedAt.toISOString()
    };
  });
}
