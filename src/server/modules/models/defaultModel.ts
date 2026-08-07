/**
 * 默认模型解析（models 域）
 * =============================================================================
 * 文件定位：`src/server/modules/models/defaultModel.ts`
 *
 * 职责：
 * - 解析系统默认模型（isDefault 优先，否则最近更新的启用模型），供 AiCallExecutor 统一使用；
 * - 提供运行时可执行模型配置类型（含解密密钥，仅存在于调用链，不写日志）。
 *
 * 设计约束：
 * - 所有 AI 调用统一使用默认模型，不做 per-stage / per-feature 模型映射；
 * - API Key 只在解析时解密，返回值不落日志。
 */
import type { AiModel, PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";
import type { AiProviderProtocol } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";

/** AI 调用参数（统一使用默认档位）。 */
export interface AiCallParams {
  /** 单次调用最大重试次数（不含首次请求）。 */
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
  /** 展示名（便于日志与错误定位）。 */
  displayName: string;
  /** 请求基地址。 */
  baseUrl    : string;
  /** 解密后的调用密钥。 */
  apiKey     : string;
  /** 调用参数（重试档位）。 */
  params     : AiCallParams;
}

/** 默认模型解析错误。 */
export class DefaultModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DefaultModelError";
  }
}

/** 从 AiModel 记录读取并解密密文 Key。 */
function readEncryptedApiKey(apiKey: string | null, modelName: string): string {
  if (!apiKey) {
    throw new DefaultModelError(`模型「${modelName}」未配置 API Key`);
  }

  if (!apiKey.startsWith("enc:v1:")) {
    throw new DefaultModelError(`模型「${modelName}」API Key 存储格式非法，请在模型设置页重新保存`);
  }

  return decryptValue(apiKey);
}

/** 把数据库 protocol 值规范化为受支持的协议枚举。 */
function normalizeProtocol(protocol: string): AiProviderProtocol {
  if (protocol === "openai-compatible" || protocol === "gemini") {
    return protocol;
  }
  throw new DefaultModelError(`不支持的模型协议: ${protocol}`);
}

/**
 * 功能：把 AiModel 记录转换为运行时可执行模型配置。
 * 输入：AiModel 记录、调用参数。
 * 输出：`ResolvedFeatureModel`。
 * 异常：缺失/非法 API Key、协议不支持时抛 `DefaultModelError`。
 * 副作用：无。
 */
export function toResolvedFeatureModel(
  model: AiModel,
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
 * 功能：解析系统默认模型（优先 isDefault，否则取最近更新的启用模型）。
 * 输入：prisma 客户端。
 * 输出：可执行模型配置。
 * 异常：系统无任何启用模型时抛 `DefaultModelError`。
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
    throw new DefaultModelError("未找到可用模型，请在 /admin/model 配置并启用至少一个模型");
  }

  return toResolvedFeatureModel(model as AiModel);
}

/**
 * 功能：按 id 解析可执行模型（跨模型复核用，显式指定目标模型）。
 * 输入：模型 id、prisma 客户端。
 * 输出：可执行模型配置。
 * 异常：模型不存在 / 未启用 / API Key 缺失或非法时抛 `DefaultModelError`。
 * 副作用：读取数据库。
 */
export async function loadModelById(
  modelId: string,
  prismaClient: PrismaClient = prisma
): Promise<ResolvedFeatureModel> {
  const model = await prismaClient.aiModel.findUnique({
    where : { id: modelId },
    select: runtimeModelSelect
  });
  if (!model) {
    throw new DefaultModelError(`模型不存在: ${modelId}`);
  }
  if (!model.isEnabled) {
    throw new DefaultModelError(`模型未启用: ${model.name}`);
  }

  return toResolvedFeatureModel(model as AiModel);
}
