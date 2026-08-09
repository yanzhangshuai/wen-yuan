/**
 * =============================================================================
 * 文件定位（分析服务：AI 调用执行器）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/services/AiCallExecutor.ts`
 *
 * 模块职责：
 * - 封装"单次 AI 调用"的通用执行策略：统一默认模型解析、重试、日志落库；
 * - 统一不同 Provider 的 usage 结构，保证成本统计链路口径一致；
 * - 在失败路径上保留足够上下文，便于审计与问题追踪。
 *
 * 在分析链路中的位置：
 * - 上游：身份解析 / 提取 / skill 选择等业务通过 `callFn` 注入具体调用逻辑；
 * - 下游：`analysis_phase_logs`、默认模型解析（loadSystemDefaultModel）、Provider 客户端。
 *
 * 关键业务约束：
 * - 所有 AI 调用统一使用系统默认模型，不做 per-stage / per-feature 模型映射；
 * - `analysis_phase_logs.stage` 存调用方传入的单一 stage 标识；
 * - 日志字段（stage/model/source/status）是运维可观测性主键，必须保持稳定。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";
import {
  loadModelById,
  loadSystemDefaultModel,
  type ResolvedFeatureModel
} from "@/server/modules/models/defaultModel";
import {
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
    message.includes("connection reset") ||
    // 空响应多属模型侧瞬时故障（如超长 prompt 后深思考未产出正文），值得重试而非一次判死。
    message.includes("empty response") ||
    // 输出截断/非 JSON：稠密分片输出超 max_tokens 被截断，重试常能产出更紧凑的合法 JSON。
    // 片级重试（extractSliceWithRetry）仍会兜底，此处让 AiCallExecutor 内部也重试，提高恢复概率。
    message.includes("输出非 json")
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
  /** 失败时所使用的模型 ID（用于问题定位与告警聚类）。 */
  readonly modelId: string;

  constructor(message: string, modelId: string) {
    super(message);
    this.name = "AiCallExhaustedError";
    this.modelId = modelId;
  }
}

export interface ExecuteAiCallInput<TData> {
  /** 单一阶段标识：写入 `analysis_phase_logs.stage`（如 "SKILL_SELECT"、"INDEPENDENT_EXTRACTION"）。 */
  stage      : string;
  /** 已构建好的 Prompt 消息。 */
  prompt     : PromptMessageInput;
  /** 分析任务 ID（日志与成本统计主键）。 */
  jobId      : string;
  /** 可选：覆盖默认模型的指定模型 id（跨模型复核用）；缺省 = 系统默认模型。 */
  modelId?   : string;
  /** 可选章节 ID；章节级调用会填写。 */
  chapterId? : string | null;
  /** 可选分片序号；分段分析场景会填写。 */
  chunkIndex?: number | null;
  /** 由调用方注入的实际 AI 调用函数。 */
  callFn: (input: {
    /** 执行时使用的具体模型（默认模型或 modelId 覆盖）。 */
    model : ResolvedFeatureModel;
    /** 传入 Provider 的 Prompt。 */
    prompt: PromptMessageInput;
  }) => Promise<AiCallFnResult<TData>>;
}

/** 返回值不携带模型标识（调用方不消费）；phase log 已落 modelId。 */
export type ExecuteAiCallResult<TData> = AiCallFnResult<TData>;

/**
 * 功能：创建 AI 调用执行器，统一默认模型解析、重试与阶段日志写入。
 * 输入：prisma 客户端。
 * 输出：`AiCallExecutor` 实例。
 * 异常：底层数据库或模型解析异常向上抛出。
 * 副作用：写入 `analysis_phase_logs`。
 */
export function createAiCallExecutor(prismaClient: PrismaClient = prisma) {
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
    stage           : string;
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
   * 异常：重试耗尽或 fallback 不可用时抛 `AiCallExhaustedError`。
   * 副作用：按尝试过程持续写入阶段日志。
   */
  async function executeWithModel<TData>(input: {
    stage      : string;
    prompt     : PromptMessageInput;
    jobId      : string;
    chapterId? : string | null;
    chunkIndex?: number | null;
    model      : ResolvedFeatureModel;
    modelSource: string;
    callFn     : ExecuteAiCallInput<TData>["callFn"];
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
          modelSource     : input.modelSource,
          isFallback      : false,
          promptTokens    : result.usage?.promptTokens ?? null,
          completionTokens: result.usage?.completionTokens ?? null,
          durationMs      : Date.now() - startedAt,
          status          : "SUCCESS",
          chunkIndex      : input.chunkIndex
        });

        return result;
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
            modelSource     : input.modelSource,
            isFallback      : false,
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
          modelSource     : input.modelSource,
          isFallback      : false,
          promptTokens    : usageFromError?.promptTokens ?? null,
          completionTokens: usageFromError?.completionTokens ?? null,
          durationMs      : Date.now() - startedAt,
          status          : "ERROR",
          errorMessage    : toErrorMessage(error),
          chunkIndex      : input.chunkIndex
        });

        throw new AiCallExhaustedError(
          `阶段 ${input.stage} 调用失败，模型 ${input.model.displayName} 尝试 ${attempt} 次后放弃`,
          input.model.modelId
        );
      }
    }

    throw new AiCallExhaustedError(
      `阶段 ${input.stage} 调用失败，模型 ${input.model.displayName} 尝试 ${maxAttempts} 次后放弃`,
      input.model.modelId
    );
  }

  /**
   * 功能：执行一次 AI 调用入口。
   * 输入：stage、prompt 与业务调用函数。
   * 输出：调用结果与 usage。
   * 异常：重试全部耗尽时抛 `AiCallExhaustedError`。
   * 副作用：解析系统默认模型并写入阶段日志。
   */
  async function execute<TData>(input: ExecuteAiCallInput<TData>): Promise<ExecuteAiCallResult<TData>> {
    // modelId 覆盖：跨模型复核显式指定模型；缺省走系统默认。
    const model = input.modelId
      ? await loadModelById(input.modelId, prismaClient)
      : await loadSystemDefaultModel(prismaClient);

    return executeWithModel({
      stage      : input.stage,
      prompt     : input.prompt,
      jobId      : input.jobId,
      chapterId  : input.chapterId,
      chunkIndex : input.chunkIndex,
      model,
      modelSource: input.modelId ? "CROSS_MODEL" : "SYSTEM_DEFAULT",
      callFn     : input.callFn
    });
  }

  return {
    execute
  };
}

export type AiCallExecutor = ReturnType<typeof createAiCallExecutor>;
export const aiCallExecutor = createAiCallExecutor(prisma);

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
