/**
 * =============================================================================
 * 文件定位（分析服务：阶段模型策略解析器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/services/ModelStrategyResolver.ts`
 *
 * 模块职责：
 * - 解析分析任务各阶段应使用的模型与参数；
 * - 合并三层策略来源：任务级（JOB）> 书籍级（BOOK）> 全局级（GLOBAL）；
 * - 在配置缺失时回退系统默认模型，并输出可直接调用 Provider 的配置。
 *
 * 业务价值：
 * - 让“每个阶段用哪个模型、用什么参数”成为可管理配置而非硬编码；
 * - 为重试/fallback/成本控制提供统一决策入口。
 *
 * 关键约束：
 * - 策略优先级是业务规则，不可随意颠倒；
 * - API Key 只在解析结果中短暂以明文存在，用于调用链，不应写日志。
 * =============================================================================
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";
import type { AiProviderProtocol } from "@/server/providers/ai";
import { strategyStagesSchema, type StrategyStagesDto } from "@/server/modules/analysis/dto/modelStrategy";
import { decryptValue } from "@/server/security/encryption";
import {
  BUSINESS_PIPELINE_STAGES,
  DEFAULT_STAGE_PARAMS,
  PipelineStage,
  type StageModelSource,
  type StageParams
} from "@/types/pipeline";

const ALL_PIPELINE_STAGES: PipelineStage[] = [
  ...BUSINESS_PIPELINE_STAGES,
  PipelineStage.FALLBACK
];

/** 策略层级：任务 > 书籍 > 全局。用于构建优先级链。 */
type StrategyLayer = "JOB" | "BOOK" | "GLOBAL";

interface LoadedModel {
  /** 模型配置主键。 */
  id       : string;
  /** provider 原始值（数据库字段）。 */
  provider : string;
  /** provider 调用协议。 */
  protocol : string;
  /** 管理端显示名。 */
  name     : string;
  /** provider 侧模型 ID。 */
  modelId  : string;
  /** API Base URL。 */
  baseUrl  : string;
  /** 加密后的 API Key（解析时解密）。 */
  apiKey   : string | null;
  /** 是否启用。 */
  isEnabled: boolean;
  /** 是否默认模型。 */
  isDefault: boolean;
  /** 更新时间。 */
  updatedAt: Date;
}

interface LayerSnapshot {
  /** 任务级覆盖（优先级最高）。 */
  JOB   : StrategyStagesDto | null;
  /** 书籍级配置（中间层）。 */
  BOOK  : StrategyStagesDto | null;
  /** 全局配置（最低层）。 */
  GLOBAL: StrategyStagesDto | null;
}

export interface ResolveStageContext {
  /** 当前任务关联书籍 ID；用于读取 BOOK 层策略。 */
  bookId?: string | null;
  /** 当前分析任务 ID；用于读取 JOB 层策略。 */
  jobId? : string | null;
}

export interface ResolvedStageModel {
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
  /** 来源层级（JOB/BOOK/GLOBAL/SYSTEM_DEFAULT）。 */
  source     : Exclude<StageModelSource, "FALLBACK">;
  /** 阶段参数（温度、重试等）。 */
  params     : StageParams;
}

export interface ResolvedFallbackModel extends Omit<ResolvedStageModel, "source"> {
  /** fallback 来源标识（用于日志区分主路径与兜底路径）。 */
  source: StageModelSource;
}

interface ResolveFallbackOptions {
  refresh?: boolean;
}

interface CreateModelStrategyResolverOptions {
  fallbackRefreshOnRetry?: boolean;
}

/**
 * 功能：把数据库 protocol 字段规范化为受支持的协议枚举。
 * 输入：数据库中的 protocol 原始值。
 * 输出：标准化后的 `AiProviderProtocol`。
 * 异常：protocol 不受支持时抛错。
 * 副作用：无。
 */
function normalizeProtocol(protocol: string): AiProviderProtocol {
  if (protocol === "openai-compatible" || protocol === "gemini") {
    return protocol;
  }
  throw new Error(`不支持的模型协议: ${protocol}`);
}

/**
 * 功能：读取并解密模型 API Key。
 * 输入：数据库密文字段与模型展示名（仅用于错误提示）。
 * 输出：可直接用于调用 provider 的明文 key。
 * 异常：缺失 key 或密文格式不合法时抛错。
 * 副作用：无。
 */
function readEncryptedApiKey(apiKey: string | null, modelName: string): string {
  if (!apiKey) {
    throw new Error(`模型「${modelName}」未配置 API Key`);
  }

  if (!apiKey.startsWith("enc:v1:")) {
    throw new Error(`模型「${modelName}」API Key 存储格式非法，请在模型设置页重新保存`);
  }

  return decryptValue(apiKey);
}

/**
 * 功能：解析策略 JSON，并在历史脏数据场景下安全回退为空策略。
 * 输入：数据库 `stages` JSON 值。
 * 输出：通过 schema 校验后的阶段配置对象。
 * 异常：无（解析失败时返回空对象）。
 * 副作用：无。
 */
function parseStagesJson(stages: Prisma.JsonValue): StrategyStagesDto {
  const parsed = strategyStagesSchema.safeParse(stages);
  return parsed.success ? parsed.data : {};
}

/**
 * 功能：按“显式覆盖优先”合并阶段参数。
 * 输入：系统默认参数与单层策略参数。
 * 输出：该层最终生效的阶段参数。
 * 异常：无。
 * 副作用：无。
 */
function mergeStageParams(base: StageParams, input: StrategyStagesDto[PipelineStage]): StageParams {
  if (!input) {
    return base;
  }

  const merged: StageParams = {
    temperature    : input.temperature ?? base.temperature,
    maxOutputTokens: input.maxOutputTokens ?? base.maxOutputTokens,
    topP           : input.topP ?? base.topP,
    maxRetries     : input.maxRetries ?? base.maxRetries,
    retryBaseMs    : input.retryBaseMs ?? base.retryBaseMs
  };

  if (typeof input.enableThinking === "boolean") {
    merged.enableThinking = input.enableThinking;
  } else if (typeof base.enableThinking === "boolean") {
    merged.enableThinking = base.enableThinking;
  }

  if (input.reasoningEffort) {
    merged.reasoningEffort = input.reasoningEffort;
  } else if (base.reasoningEffort) {
    merged.reasoningEffort = base.reasoningEffort;
  }

  return merged;
}

function toModelSource(layer: StrategyLayer): Exclude<StageModelSource, "FALLBACK"> {
  // 显式 switch 可在新增层级时保持穷尽检查，避免静默落入错误默认值。
  switch (layer) {
    case "JOB":
      return "JOB";
    case "BOOK":
      return "BOOK";
    case "GLOBAL":
      return "GLOBAL";
    default:
      return "SYSTEM_DEFAULT";
  }
}

function toResolvedModel(
  model: LoadedModel,
  source: Exclude<StageModelSource, "FALLBACK">,
  params: StageParams
): ResolvedStageModel {
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

function contextCacheKey(context: ResolveStageContext): string {
  // 缓存键把缺失值统一映射为 "_"，保证 `undefined/null` 不会拆分为两套缓存。
  const jobPart = context.jobId ?? "_";
  const bookPart = context.bookId ?? "_";
  return `${jobPart}:${bookPart}`;
}

/**
 * 功能：按策略层级读取阶段配置。
 * 输入：prisma 客户端、层级（JOB/BOOK/GLOBAL）与解析上下文。
 * 输出：该层策略；不存在时返回 `null`。
 * 异常：数据库查询失败时向上抛出。
 * 副作用：读取数据库。
 */
async function loadLayerConfig(
  prismaClient: PrismaClient,
  layer: StrategyLayer,
  context: ResolveStageContext
): Promise<StrategyStagesDto | null> {
  if (layer === "JOB") {
    if (!context.jobId) return null;
    const config = await prismaClient.modelStrategyConfig.findFirst({
      where: {
        scope: "JOB",
        jobId: context.jobId
      },
      select: { stages: true }
    });
    return config ? parseStagesJson(config.stages) : null;
  }

  if (layer === "BOOK") {
    if (!context.bookId) return null;
    const config = await prismaClient.modelStrategyConfig.findFirst({
      where: {
        scope : "BOOK",
        bookId: context.bookId
      },
      select: { stages: true }
    });
    return config ? parseStagesJson(config.stages) : null;
  }

  const config = await prismaClient.modelStrategyConfig.findFirst({
    where : { scope: "GLOBAL" },
    select: { stages: true }
  });
  return config ? parseStagesJson(config.stages) : null;
}

function collectConfiguredModelIds(layers: LayerSnapshot): string[] {
  const modelIds = new Set<string>();

  for (const layerName of ["JOB", "BOOK", "GLOBAL"] as const) {
    const layer = layers[layerName];
    if (!layer) continue;

    for (const stage of ALL_PIPELINE_STAGES) {
      const stageConfig = layer[stage];
      const modelId = stageConfig?.modelId;
      if (modelId) {
        modelIds.add(modelId);
      }
    }
  }

  return Array.from(modelIds);
}

/**
 * 功能：批量加载策略中引用且已启用的模型。
 * 输入：模型 UUID 列表。
 * 输出：`modelId -> model` 的映射表。
 * 异常：数据库查询失败时向上抛出。
 * 副作用：读取数据库。
 */
async function loadEnabledModels(prismaClient: PrismaClient, modelIds: string[]): Promise<Map<string, LoadedModel>> {
  if (modelIds.length === 0) {
    return new Map();
  }

  const models = await prismaClient.aiModel.findMany({
    where: {
      id       : { in: modelIds },
      isEnabled: true
    },
    select: {
      id       : true,
      provider : true,
      protocol : true,
      name     : true,
      modelId  : true,
      baseUrl  : true,
      apiKey   : true,
      isEnabled: true,
      isDefault: true,
      updatedAt: true
    }
  });

  const modelMap = new Map<string, LoadedModel>();
  for (const model of models) {
    modelMap.set(model.id, model);
  }

  return modelMap;
}

/**
 * 功能：获取系统默认模型。
 * 输入：prisma 客户端。
 * 输出：可用的默认模型（优先 `isDefault`，否则退化到最近更新的启用模型）。
 * 异常：系统无任何启用模型时抛错。
 * 副作用：读取数据库。
 */
async function loadSystemDefaultModel(prismaClient: PrismaClient): Promise<LoadedModel> {
  const defaultModel = await prismaClient.aiModel.findFirst({
    where  : { isEnabled: true, isDefault: true },
    orderBy: { updatedAt: "desc" },
    select : {
      id       : true,
      provider : true,
      protocol : true,
      name     : true,
      modelId  : true,
      baseUrl  : true,
      apiKey   : true,
      isEnabled: true,
      isDefault: true,
      updatedAt: true
    }
  });

  if (defaultModel) {
    return defaultModel;
  }

  const firstEnabled = await prismaClient.aiModel.findFirst({
    where  : { isEnabled: true },
    orderBy: { updatedAt: "desc" },
    select : {
      id       : true,
      provider : true,
      protocol : true,
      name     : true,
      modelId  : true,
      baseUrl  : true,
      apiKey   : true,
      isEnabled: true,
      isDefault: true,
      updatedAt: true
    }
  });

  if (!firstEnabled) {
    throw new Error("未找到可用模型，请在 /admin/model 配置并启用至少一个模型");
  }

  return firstEnabled;
}

/**
 * 功能：把三层配置解析为某一阶段的最终模型。
 * 输入：阶段、层级快照、可用模型映射、系统默认模型。
 * 输出：可用于执行调用的阶段模型配置。
 * 异常：无（若策略层都不可用则回退系统默认）。
 * 副作用：无。
 */
function resolveStageFromLayers(
  stage: PipelineStage,
  layers: LayerSnapshot,
  enabledModelMap: Map<string, LoadedModel>,
  systemDefaultModel: LoadedModel
): ResolvedStageModel {
  for (const layer of ["JOB", "BOOK", "GLOBAL"] as const) {
    const stageConfig = layers[layer]?.[stage];
    if (!stageConfig) {
      continue;
    }

    const model = enabledModelMap.get(stageConfig.modelId);
    if (!model) {
      continue;
    }

    const params = mergeStageParams(DEFAULT_STAGE_PARAMS[stage], stageConfig);
    return toResolvedModel(model, toModelSource(layer), params);
  }

  return toResolvedModel(systemDefaultModel, "SYSTEM_DEFAULT", DEFAULT_STAGE_PARAMS[stage]);
}

/**
 * 功能：创建模型策略解析器，负责阶段模型选择与 fallback 解析。
 * 输入：prisma 客户端与可选行为参数。
 * 输出：`ModelStrategyResolver` 实例。
 * 异常：底层数据库/配置错误向上抛出。
 * 副作用：读取数据库并维护进程内缓存。
 */
export function createModelStrategyResolver(
  prismaClient: PrismaClient = prisma,
  options: CreateModelStrategyResolverOptions = {}
) {
  const strategyCache = new Map<string, Map<PipelineStage, ResolvedStageModel>>();

  /**
   * 功能：一次性解析上下文的全部阶段模型并构建映射。
   * 输入：当前 job/book 上下文。
   * 输出：阶段到已解析模型的映射。
   * 异常：配置非法、模型不可用或数据库失败时抛错。
   * 副作用：并发读取策略表与模型表。
   */
  async function buildResolvedMap(context: ResolveStageContext): Promise<Map<PipelineStage, ResolvedStageModel>> {
    const [jobStages, bookStages, globalStages] = await Promise.all([
      loadLayerConfig(prismaClient, "JOB", context),
      loadLayerConfig(prismaClient, "BOOK", context),
      loadLayerConfig(prismaClient, "GLOBAL", context)
    ]);

    const layers: LayerSnapshot = {
      JOB   : jobStages,
      BOOK  : bookStages,
      GLOBAL: globalStages
    };

    const modelIds = collectConfiguredModelIds(layers);
    const [enabledModelMap, systemDefaultModel] = await Promise.all([
      loadEnabledModels(prismaClient, modelIds),
      loadSystemDefaultModel(prismaClient)
    ]);

    const stageMap = new Map<PipelineStage, ResolvedStageModel>();
    for (const stage of ALL_PIPELINE_STAGES) {
      stageMap.set(stage, resolveStageFromLayers(stage, layers, enabledModelMap, systemDefaultModel));
    }

    return stageMap;
  }

  /**
   * 功能：主动预热某上下文的策略缓存，减少后续阶段调用抖动。
   * 输入：解析上下文。
   * 输出：该上下文的阶段映射副本。
   * 异常：同 `buildResolvedMap`。
   * 副作用：写入进程内缓存。
   */
  async function preloadStrategy(context: ResolveStageContext): Promise<Map<PipelineStage, ResolvedStageModel>> {
    const key = contextCacheKey(context);
    const stageMap = await buildResolvedMap(context);
    strategyCache.set(key, stageMap);
    return new Map(stageMap);
  }

  /**
   * 功能：优先使用缓存读取策略，缓存缺失时回源数据库。
   * 输入：解析上下文。
   * 输出：阶段映射。
   * 异常：同 `buildResolvedMap`。
   * 副作用：可能触发数据库读取并写入缓存。
   */
  async function loadFromCacheOrDb(context: ResolveStageContext): Promise<Map<PipelineStage, ResolvedStageModel>> {
    const key = contextCacheKey(context);
    const cached = strategyCache.get(key);
    if (cached) {
      return cached;
    }

    const loaded = await buildResolvedMap(context);
    strategyCache.set(key, loaded);
    return loaded;
  }

  /**
   * 功能：解析业务阶段对应的主模型。
   * 输入：阶段与解析上下文。
   * 输出：该阶段可执行模型。
   * 异常：阶段未命中可用模型时抛错。
   * 副作用：可能触发数据库读取和缓存写入。
   */
  async function resolveForStage(
    stage: PipelineStage,
    context: ResolveStageContext
  ): Promise<ResolvedStageModel> {
    const stageMap = await loadFromCacheOrDb(context);
    const resolved = stageMap.get(stage);
    if (!resolved) {
      throw new Error(`阶段 ${stage} 未找到可用模型`);
    }

    return resolved;
  }

  /**
   * 功能：解析 fallback 槽位模型，并根据策略决定是否强制刷新缓存。
   * 输入：解析上下文与 fallback 解析选项。
   * 输出：fallback 模型配置；若来源不是系统默认，则统一标记为 `FALLBACK`。
   * 异常：未找到 fallback 模型时抛错。
   * 副作用：可选刷新缓存并读取数据库。
   */
  async function resolveFallback(
    context: ResolveStageContext,
    resolveOptions?: ResolveFallbackOptions
  ): Promise<ResolvedFallbackModel> {
    const shouldRefresh = resolveOptions?.refresh ?? options.fallbackRefreshOnRetry ?? false;
    const stageMap = shouldRefresh
      ? await buildResolvedMap(context)
      : await loadFromCacheOrDb(context);

    if (shouldRefresh) {
      strategyCache.set(contextCacheKey(context), stageMap);
    }

    const fallback = stageMap.get(PipelineStage.FALLBACK);
    if (!fallback) {
      throw new Error("未找到 fallback 模型");
    }

    return {
      ...fallback,
      source: fallback.source === "SYSTEM_DEFAULT" ? "SYSTEM_DEFAULT" : "FALLBACK"
    };
  }

  /**
   * 功能：清理预热策略缓存。
   * 输入：可选上下文；为空时清空全部缓存。
   * 输出：无。
   * 异常：无。
   * 副作用：删除进程内缓存数据。
   */
  function clearPreloadedStrategy(context?: ResolveStageContext): void {
    if (!context) {
      strategyCache.clear();
      return;
    }

    strategyCache.delete(contextCacheKey(context));
  }

  return {
    resolveForStage,
    resolveFallback,
    preloadStrategy,
    clearPreloadedStrategy
  };
}

export type ModelStrategyResolver = ReturnType<typeof createModelStrategyResolver>;

export const modelStrategyResolver = createModelStrategyResolver(prisma);
