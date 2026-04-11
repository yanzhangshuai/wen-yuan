/**
 * =============================================================================
 * 文件定位（分析服务：AI 调用执行器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/services/AiCallExecutor.ts`
 *
 * 模块职责：
 * - 封装“单次 AI 阶段调用”的通用执行策略：模型解析、重试、回退模型、日志落库；
 * - 统一不同 Provider 的 usage 结构，保证成本统计链路口径一致；
 * - 在失败路径上保留足够上下文，便于审计与问题追踪。
 *
 * 在分析链路中的位置：
 * - 上游：章节分析/验证等业务服务通过 `callFn` 注入具体调用逻辑；
 * - 下游：`analysis_phase_logs`、模型策略解析器、Provider 客户端。
 *
 * 关键业务约束：
 * - 重试/回退策略直接影响成本与成功率，属于业务策略，不应随意改动；
 * - 日志字段（stage/model/source/status）是运维可观测性主键，必须保持稳定。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";
import {
  modelStrategyResolver,
  type ModelStrategyResolver,
  type ResolvedFallbackModel,
  type ResolveStageContext,
  type ResolvedStageModel
} from "@/server/modules/analysis/services/ModelStrategyResolver";
import {
  PipelineStage,
  type AiUsage,
  type AiCallFnResult,
  type PromptMessageInput
} from "@/types/pipeline";

/**
 * 功能：等待指定毫秒，用于重试退避。
 * 输入：等待时长（毫秒）。
 * 输出：`Promise<void>`。
 * 异常：无。
 * 副作用：无。
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/**
 * 功能：判断错误是否可重试。
 * 输入：任意错误对象。
 * 输出：是否属于暂时性错误（限流、网络抖动、超时等）。
 * 异常：无。
 * 副作用：无。
 */
function isRetryableError(error: unknown): boolean {
  const message = (error instanceof Error ? error.message : String(error)).toLowerCase();
  return (
    message.includes("429") ||
    message.includes("rate limit") ||
    message.includes("timeout") ||
    message.includes("temporarily unavailable") ||
    message.includes("econnreset") ||
    message.includes("network") ||
    message.includes("terminated") ||
    message.includes("aborted") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    message.includes("connection reset")
  );
}

/**
 * 功能：把未知错误压缩为可写日志的稳定字符串。
 * 输入：任意错误对象。
 * 输出：最长 1000 字符的错误信息。
 * 异常：无。
 * 副作用：无。
 */
function toErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message.slice(0, 1000);
  }

  return String(error).slice(0, 1000);
}

/**
 * 功能：把未知值收敛为可安全取字段的对象。
 * 输入：任意值。
 * 输出：对象记录（仅 plain object / class instance）。
 * 异常：无。
 * 副作用：无。
 */
function toRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value === "object" && value !== null) {
    return value as Record<string, unknown>;
  }
  return null;
}

/**
 * 功能：按路径读取嵌套属性，避免在错误对象结构不稳定时抛异常。
 * 输入：起始值与字段路径数组。
 * 输出：命中的值；任一层不存在时返回 null。
 * 异常：无。
 * 副作用：无。
 */
function getNestedValue(root: unknown, path: string[]): unknown {
  let current: unknown = root;
  for (const key of path) {
    const currentRecord = toRecord(current);
    if (!currentRecord || !(key in currentRecord)) {
      return null;
    }
    current = currentRecord[key];
  }
  return current;
}

/**
 * 功能：把多 Provider 的 usage 形态统一为 AiUsage。
 * 输入：可能是 unified / OpenAI snake_case / Gemini usageMetadata 的对象。
 * 输出：标准 AiUsage；若无法识别则返回 null。
 * 异常：无。
 * 副作用：无。
 */
function normalizeUsage(rawUsage: unknown): AiUsage | null {
  const usageRecord = toRecord(rawUsage);
  if (!usageRecord) {
    return null;
  }

  const promptTokens =
    typeof usageRecord.promptTokens === "number"
      ? usageRecord.promptTokens
      : typeof usageRecord.prompt_tokens === "number"
        ? usageRecord.prompt_tokens
        : typeof usageRecord.promptTokenCount === "number"
          ? usageRecord.promptTokenCount
          : null;
  const completionTokens =
    typeof usageRecord.completionTokens === "number"
      ? usageRecord.completionTokens
      : typeof usageRecord.completion_tokens === "number"
        ? usageRecord.completion_tokens
        : typeof usageRecord.candidatesTokenCount === "number"
          ? usageRecord.candidatesTokenCount
          : null;
  const totalTokens =
    typeof usageRecord.totalTokens === "number"
      ? usageRecord.totalTokens
      : typeof usageRecord.total_tokens === "number"
        ? usageRecord.total_tokens
        : typeof usageRecord.totalTokenCount === "number"
          ? usageRecord.totalTokenCount
          : null;

  if (promptTokens === null && completionTokens === null && totalTokens === null) {
    return null;
  }

  return {
    promptTokens,
    completionTokens,
    totalTokens
  };
}

/**
 * 功能：从 Provider 抛出的错误对象中提取 usage（若存在）。
 * 输入：任意错误对象。
 * 输出：标准 AiUsage；没有 usage 时返回 null。
 * 异常：无。
 * 副作用：无。
 */
function extractUsageFromError(error: unknown): AiUsage | null {
  const candidates = [
    getNestedValue(error, ["usage"]),
    getNestedValue(error, ["data", "usage"]),
    getNestedValue(error, ["response", "usage"]),
    getNestedValue(error, ["response", "data", "usage"]),
    getNestedValue(error, ["usageMetadata"]),
    getNestedValue(error, ["response", "data", "usageMetadata"]),
    getNestedValue(error, ["cause", "usage"]),
    getNestedValue(error, ["cause", "response", "data", "usage"]),
    getNestedValue(error, ["cause", "response", "data", "usageMetadata"])
  ];

  for (const candidate of candidates) {
    const normalized = normalizeUsage(candidate);
    if (normalized) {
      return normalized;
    }
  }

  return null;
}

export class AiCallExhaustedError extends Error {
  /** 当前失败发生的业务阶段（用于上游决定是否中断流水线）。 */
  readonly stage     : PipelineStage;
  /** 失败时所使用的模型 ID（用于问题定位与告警聚类）。 */
  readonly modelId   : string;
  /** 是否已处于 fallback 模型路径（用于区分主模型失败与兜底失败）。 */
  readonly isFallback: boolean;

  constructor(message: string, stage: PipelineStage, modelId: string, isFallback: boolean) {
    super(message);
    this.name = "AiCallExhaustedError";
    this.stage = stage;
    this.modelId = modelId;
    this.isFallback = isFallback;
  }
}

export interface ExecuteAiCallInput<TData> {
  /** 当前调用所属的分析阶段。 */
  stage      : PipelineStage;
  /** 已构建好的 Prompt 消息。 */
  prompt     : PromptMessageInput;
  /** 分析任务 ID（日志与成本统计主键）。 */
  jobId      : string;
  /** 可选章节 ID；章节级阶段会填写。 */
  chapterId? : string | null;
  /** 可选分片序号；分段分析场景会填写。 */
  chunkIndex?: number | null;
  /** 模型策略解析上下文（书籍/任务范围）。 */
  context    : ResolveStageContext;
  /** 由调用方注入的实际 AI 调用函数。 */
  callFn: (input: {
    /** 执行时决定的具体模型（主模型或回退模型）。 */
    model : ResolvedStageModel | ResolvedFallbackModel;
    /** 传入 Provider 的 Prompt。 */
    prompt: PromptMessageInput;
  }) => Promise<AiCallFnResult<TData>>;
}

export interface ExecuteAiCallResult<TData> extends AiCallFnResult<TData> {
  /** 实际成功返回所使用的模型 ID。 */
  modelId   : string;
  /** 是否由 fallback 模型完成。 */
  isFallback: boolean;
}

/**
 * 功能：创建 AI 调用执行器，统一重试、fallback 与阶段日志写入。
 * 输入：prisma 客户端与模型策略解析器。
 * 输出：`AiCallExecutor` 实例。
 * 异常：底层数据库或模型解析异常向上抛出。
 * 副作用：写入 `analysis_phase_logs`。
 */
export function createAiCallExecutor(
  prismaClient: PrismaClient = prisma,
  resolver: ModelStrategyResolver = modelStrategyResolver
) {
  /**
   * 功能：记录阶段调用日志（成功/重试/失败）。
   * 输入：阶段调用上下文与统计信息。
   * 输出：无。
   * 异常：数据库写入失败时向上抛出。
   * 副作用：写入 `analysis_phase_logs`。
   */
  async function writePhaseLog(input: {
    jobId           : string;
    chapterId?      : string | null;
    stage           : PipelineStage;
    modelId         : string;
    modelSource     : string;
    isFallback      : boolean;
    promptTokens    : number | null;
    completionTokens: number | null;
    durationMs      : number;
    status          : "SUCCESS" | "ERROR" | "RETRIED";
    errorMessage?   : string | null;
    chunkIndex?     : number | null;
  }): Promise<void> {
    await prismaClient.analysisPhaseLog.create({
      data: {
        jobId           : input.jobId,
        chapterId       : input.chapterId ?? null,
        stage           : input.stage,
        modelId         : input.modelId,
        modelSource     : input.modelSource,
        isFallback      : input.isFallback,
        promptTokens    : input.promptTokens,
        completionTokens: input.completionTokens,
        durationMs      : input.durationMs,
        status          : input.status,
        errorMessage    : input.errorMessage ?? null,
        chunkIndex      : input.chunkIndex ?? null
      }
    });
  }

  /**
   * 功能：使用指定模型执行调用，并在同模型内完成重试。
   * 输入：调用上下文、模型配置与业务 `callFn`。
   * 输出：调用结果与 usage，并附带模型标识。
   * 异常：重试耗尽或 fallback 同模型时抛 `AiCallExhaustedError`。
   * 副作用：按尝试过程持续写入阶段日志。
   */
  async function executeWithModel<TData>(input: {
    stage        : PipelineStage;
    prompt       : PromptMessageInput;
    jobId        : string;
    chapterId?   : string | null;
    chunkIndex?  : number | null;
    model        : ResolvedStageModel | ResolvedFallbackModel;
    isFallback   : boolean;
    allowFallback: boolean;
    callFn       : ExecuteAiCallInput<TData>["callFn"];
    context      : ResolveStageContext;
  }): Promise<ExecuteAiCallResult<TData>> {
    const maxAttempts = input.model.params.maxRetries + 1;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      const startedAt = Date.now();
      try {
        const result = await input.callFn({
          model : input.model,
          prompt: input.prompt
        });

        await writePhaseLog({
          jobId           : input.jobId,
          chapterId       : input.chapterId,
          stage           : input.stage,
          modelId         : input.model.modelId,
          modelSource     : input.isFallback ? "FALLBACK" : input.model.source,
          isFallback      : input.isFallback,
          promptTokens    : result.usage?.promptTokens ?? null,
          completionTokens: result.usage?.completionTokens ?? null,
          durationMs      : Date.now() - startedAt,
          status          : "SUCCESS",
          chunkIndex      : input.chunkIndex
        });

        return {
          ...result,
          modelId   : input.model.modelId,
          isFallback: input.isFallback
        };
      } catch (error) {
        const usageFromError = extractUsageFromError(error);
        const retryable = isRetryableError(error);
        const hasRetryBudget = attempt < maxAttempts;

        if (retryable && hasRetryBudget) {
          // RETRIED 日志用来区分“最终失败”与“过程重试”，便于成本聚合按一次执行归并。
          await writePhaseLog({
            jobId           : input.jobId,
            chapterId       : input.chapterId,
            stage           : input.stage,
            modelId         : input.model.modelId,
            modelSource     : input.isFallback ? "FALLBACK" : input.model.source,
            isFallback      : input.isFallback,
            promptTokens    : usageFromError?.promptTokens ?? null,
            completionTokens: usageFromError?.completionTokens ?? null,
            durationMs      : Date.now() - startedAt,
            status          : "RETRIED",
            errorMessage    : toErrorMessage(error),
            chunkIndex      : input.chunkIndex
          });

          await sleep(input.model.params.retryBaseMs * 2 ** (attempt - 1));
          continue;
        }

        await writePhaseLog({
          jobId           : input.jobId,
          chapterId       : input.chapterId,
          stage           : input.stage,
          modelId         : input.model.modelId,
          modelSource     : input.isFallback ? "FALLBACK" : input.model.source,
          isFallback      : input.isFallback,
          promptTokens    : usageFromError?.promptTokens ?? null,
          completionTokens: usageFromError?.completionTokens ?? null,
          durationMs      : Date.now() - startedAt,
          status          : "ERROR",
          errorMessage    : toErrorMessage(error),
          chunkIndex      : input.chunkIndex
        });

        if (!input.isFallback && input.allowFallback && input.stage !== PipelineStage.FALLBACK) {
          const fallbackModel = await resolver.resolveFallback(input.context);

          // 反自递归守卫：若 fallback 与主模型一致，会在同一失败路径无限递归。
          if (fallbackModel.modelId === input.model.modelId) {
            throw new AiCallExhaustedError(
              `阶段 ${input.stage} 调用失败，fallback 与主模型相同，已终止重试`,
              input.stage,
              input.model.modelId,
              false
            );
          }

          return await executeWithModel({
            ...input,
            model        : fallbackModel,
            isFallback   : true,
            allowFallback: false
          });
        }

        throw new AiCallExhaustedError(
          `阶段 ${input.stage} 调用失败，模型 ${input.model.displayName} 已耗尽重试`,
          input.stage,
          input.model.modelId,
          input.isFallback
        );
      }
    }

    throw new AiCallExhaustedError(
      `阶段 ${input.stage} 调用失败，模型 ${input.model.displayName} 已耗尽重试`,
      input.stage,
      input.model.modelId,
      input.isFallback
    );
  }

  /**
   * 功能：执行阶段 AI 调用入口。
   * 输入：阶段、prompt、上下文与业务调用函数。
   * 输出：调用结果、usage、最终模型与 fallback 标记。
   * 异常：主模型与 fallback 全部耗尽时抛 `AiCallExhaustedError`。
   * 副作用：读取模型策略并写入阶段日志。
   */
  async function execute<TData>(input: ExecuteAiCallInput<TData>): Promise<ExecuteAiCallResult<TData>> {
    const primaryModel = await resolver.resolveForStage(input.stage, input.context);

    return executeWithModel({
      stage        : input.stage,
      prompt       : input.prompt,
      jobId        : input.jobId,
      chapterId    : input.chapterId,
      chunkIndex   : input.chunkIndex,
      model        : primaryModel,
      isFallback   : false,
      allowFallback: true,
      callFn       : input.callFn,
      context      : input.context
    });
  }

  return {
    execute
  };
}

export type AiCallExecutor = ReturnType<typeof createAiCallExecutor>;
export const aiCallExecutor = createAiCallExecutor(prisma, modelStrategyResolver);

/**
 * 仅供单元测试使用：暴露纯帮助函数，便于稳定覆盖边界分支。
 * 业务代码禁止依赖该对象。
 */
export const aiCallExecutorTesting = {
  isRetryableError,
  toErrorMessage,
  toRecord,
  getNestedValue,
  normalizeUsage,
  extractUsageFromError
};
