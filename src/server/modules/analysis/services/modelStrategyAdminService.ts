import { Prisma, type PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";
import {
  strategyStagesSchema,
  type ModelStrategyDto,
  type StrategyStagesDto
} from "@/server/modules/analysis/dto/modelStrategy";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { BUSINESS_PIPELINE_STAGES, PipelineStage } from "@/types/pipeline";

/**
 * 文件定位（Next.js 服务端管理域）：
 * - 本文件位于 `src/server/modules/analysis/services`，承担“模型策略后台管理”与“任务成本汇总”。
 * - 它通常由 admin API route 调用（如 `/api/admin/model-strategy`、`/api/admin/analysis-jobs/.../cost-summary`）。
 *
 * 核心职责：
 * - 读写全局/书籍级模型策略（GLOBAL / BOOK）；
 * - 校验策略引用模型是否可用，防止保存不可执行配置；
 * - 汇总分析任务阶段日志，输出按阶段/模型聚合的 token 与耗时成本。
 *
 * 关键业务规则：
 * - 策略作用域优先级和可用模型校验属于业务规则，不是技术限制；
 * - 成本统计按“同一调用键最终结果”归并，避免重试日志重复计数。
 */
const ALL_STRATEGY_STAGES: PipelineStage[] = [
  ...BUSINESS_PIPELINE_STAGES,
  PipelineStage.FALLBACK
];

type StrategyScope = "GLOBAL" | "BOOK";

interface StrategyRow {
  /** 策略记录主键。 */
  id       : string;
  /** 作用域：GLOBAL/BOOK/JOB（JOB 仅作为读取兼容）。 */
  scope    : "GLOBAL" | "BOOK" | "JOB";
  /** 书籍维度策略对应书籍 ID；GLOBAL 为 null。 */
  bookId   : string | null;
  /** 任务维度策略 ID（当前管理接口通常不用）。 */
  jobId    : string | null;
  /** 阶段配置 JSON。 */
  stages   : Prisma.JsonValue;
  /** 创建时间。 */
  createdAt: Date;
  /** 更新时间。 */
  updatedAt: Date;
}

interface PhaseLogRow {
  /** 流水线阶段名。 */
  stage           : string;
  /** 章节 ID（章节级阶段有值）。 */
  chapterId       : string | null;
  /** 分块索引（chunk 级阶段有值）。 */
  chunkIndex      : number | null;
  /** 本条日志状态（SUCCESS/ERROR/RETRIED...）。 */
  status          : string;
  /** 是否使用 fallback 模型。 */
  isFallback      : boolean;
  /** 输入 token。 */
  promptTokens    : number | null;
  /** 输出 token。 */
  completionTokens: number | null;
  /** 调用耗时毫秒。 */
  durationMs      : number | null;
  /** 实际调用模型 ID。 */
  modelId         : string | null;
  /** 模型名称（模型被删时可能为 null）。 */
  model           : {
    name: string;
  } | null;
}

export interface JobCostSummaryModelItem {
  /** 模型 ID；模型已删除时可能为 null。 */
  modelId         : string | null;
  /** 模型名称（删除时显示占位名）。 */
  modelName       : string;
  /** 是否兜底模型调用。 */
  isFallback      : boolean;
  /** 调用次数。 */
  calls           : number;
  /** 输入 token 总和。 */
  promptTokens    : number;
  /** 输出 token 总和。 */
  completionTokens: number;
}

export interface JobCostSummaryStageItem {
  /** 阶段名。 */
  stage           : string;
  /** 阶段调用次数。 */
  calls           : number;
  /** 阶段输入 token 总量。 */
  promptTokens    : number;
  /** 阶段输出 token 总量。 */
  completionTokens: number;
  /** 阶段平均成功耗时（仅 SUCCESS 参与平均）。 */
  avgDurationMs   : number;
  /** 阶段内模型维度分布。 */
  models          : JobCostSummaryModelItem[];
}

export interface JobCostSummaryDto {
  /** 任务 ID。 */
  jobId                : string;
  /** 全任务输入 token 总量。 */
  totalPromptTokens    : number;
  /** 全任务输出 token 总量。 */
  totalCompletionTokens: number;
  /** 全任务总耗时（含重试累计）。 */
  totalDurationMs      : number;
  /** 调用次数（按业务调用归并后）。 */
  totalCalls           : number;
  /** 最终失败调用次数。 */
  failedCalls          : number;
  /** 最终成功且走 fallback 的调用次数。 */
  fallbackCalls        : number;
  /** 按阶段拆解明细。 */
  byStage              : JobCostSummaryStageItem[];
}

/**
 * 功能：表示模型策略提交中存在无效模型（不存在或未启用）。
 * 输入：可读错误信息。
 * 输出：`ModelStrategyValidationError` 实例。
 * 异常：无。
 * 副作用：无。
 */
export class ModelStrategyValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ModelStrategyValidationError";
  }
}

/**
 * 功能：表示任务不存在。
 * 输入：任务 ID。
 * 输出：`AnalysisJobNotFoundError` 实例。
 * 异常：无。
 * 副作用：无。
 */
export class AnalysisJobNotFoundError extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Analysis job not found: ${jobId}`);
    this.name = "AnalysisJobNotFoundError";
    this.jobId = jobId;
  }
}

/**
 * 功能：把数据库中的 JSON 阶段配置解析为类型安全对象。
 * 输入：策略表 `stages` 字段。
 * 输出：通过 schema 校验后的策略对象。
 * 异常：无（校验失败时返回空对象）。
 * 副作用：无。
 */
function parseStages(stages: Prisma.JsonValue): StrategyStagesDto {
  const parsed = strategyStagesSchema.safeParse(stages);
  return parsed.success ? parsed.data : {};
}

/**
 * 功能：将策略数据库记录转换为 API DTO。
 * 输入：策略表单行记录。
 * 输出：前后端共享的 `ModelStrategyDto`。
 * 异常：无。
 * 副作用：无。
 */
function toStrategyDto(row: StrategyRow): ModelStrategyDto {
  return {
    id       : row.id,
    scope    : row.scope,
    bookId   : row.bookId,
    jobId    : row.jobId,
    stages   : parseStages(row.stages),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

/**
 * 功能：收集策略中引用的全部模型 UUID（含 FALLBACK 槽位）。
 * 输入：阶段策略配置。
 * 输出：去重后的模型 UUID 列表。
 * 异常：无。
 * 副作用：无。
 */
function collectModelIds(stages: StrategyStagesDto): string[] {
  const modelIds = new Set<string>();
  for (const stage of ALL_STRATEGY_STAGES) {
    const modelId = stages[stage]?.modelId;
    if (modelId) {
      modelIds.add(modelId);
    }
  }

  return Array.from(modelIds);
}

/**
 * 功能：构建“同一次执行尝试”的归并键。
 * 输入：阶段日志中的阶段、章节、分块索引。
 * 输出：可用于聚合 Map 的稳定键。
 * 异常：无。
 * 副作用：无。
 */
function buildExecuteCallKey(log: Pick<PhaseLogRow, "stage" | "chapterId" | "chunkIndex">): string {
  return `${log.stage}::${log.chapterId ?? "_"}::${log.chunkIndex ?? "_"}`;
}

/**
 * 功能：创建模型策略后台服务（策略管理 + 成本汇总）。
 * 输入：prisma 客户端。
 * 输出：`ModelStrategyAdminService` 实例。
 * 异常：底层数据库/校验错误向上抛出。
 * 副作用：读写策略配置、读取阶段日志。
 */
export function createModelStrategyAdminService(
  prismaClient: PrismaClient = prisma
) {
  const strategySelect = {
    id       : true,
    scope    : true,
    bookId   : true,
    jobId    : true,
    stages   : true,
    createdAt: true,
    updatedAt: true
  } as const;

  /**
   * 功能：校验书籍存在且未软删除。
   * 输入：书籍 ID。
   * 输出：无。
   * 异常：书籍不存在时抛 `BookNotFoundError`。
   * 副作用：读取书籍表。
   */
  async function assertBookExists(bookId: string): Promise<void> {
    const book = await prismaClient.book.findFirst({
      where : { id: bookId, deletedAt: null },
      select: { id: true }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }
  }

  /**
   * 策略模型校验：只允许引用已启用模型 UUID。
   * 这样可以避免运行阶段才发现模型已失效，保证配置保存即“可执行”。
   */
  async function assertEnabledModelIds(stages: StrategyStagesDto): Promise<void> {
    const modelIds = collectModelIds(stages);
    if (modelIds.length === 0) {
      return;
    }

    const enabledModels = await prismaClient.aiModel.findMany({
      where: {
        id       : { in: modelIds },
        isEnabled: true
      },
      select: {
        id  : true,
        name: true
      }
    });

    const enabledModelIdSet = new Set(enabledModels.map((model) => model.id));
    const missingModelId = modelIds.find((modelId) => !enabledModelIdSet.has(modelId));
    if (!missingModelId) {
      return;
    }

    throw new ModelStrategyValidationError(`模型 ID ${missingModelId} 不存在或未启用`);
  }

  async function findScopedStrategy(scope: StrategyScope, bookId?: string): Promise<StrategyRow | null> {
    return await prismaClient.modelStrategyConfig.findFirst({
      where: {
        scope,
        ...(scope === "BOOK" ? { bookId } : {})
      },
      select: strategySelect
    });
  }

  /**
   * 按文档要求采用 findFirst + update/create，不使用 GLOBAL upsert。
   * 并发创建冲突（P2002）时回读后 update，确保多请求下最终收敛为单条记录。
   */
  async function saveScopedStrategy(scope: StrategyScope, stages: StrategyStagesDto, bookId?: string): Promise<StrategyRow> {
    await assertEnabledModelIds(stages);

    const current = await findScopedStrategy(scope, bookId);
    if (current) {
      return await prismaClient.modelStrategyConfig.update({
        where : { id: current.id },
        data  : { stages },
        select: strategySelect
      });
    }

    try {
      return await prismaClient.modelStrategyConfig.create({
        data: {
          scope,
          bookId: scope === "BOOK" ? bookId : null,
          stages
        },
        select: strategySelect
      });
    } catch (error) {
      const isUniqueConflict = error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
      if (!isUniqueConflict) {
        throw error;
      }

      const raced = await findScopedStrategy(scope, bookId);
      if (!raced) {
        throw error;
      }

      return await prismaClient.modelStrategyConfig.update({
        where : { id: raced.id },
        data  : { stages },
        select: strategySelect
      });
    }
  }

  async function getGlobalStrategy(): Promise<ModelStrategyDto | null> {
    const strategy = await findScopedStrategy("GLOBAL");
    return strategy ? toStrategyDto(strategy) : null;
  }

  /**
   * 功能：保存全局策略。
   * 输入：阶段策略配置。
   * 输出：保存后的全局策略 DTO。
   * 异常：模型不可用时抛 `ModelStrategyValidationError`；数据库异常向上抛出。
   * 副作用：写入 `model_strategy_configs`。
   */
  async function saveGlobalStrategy(stages: StrategyStagesDto): Promise<ModelStrategyDto> {
    const strategy = await saveScopedStrategy("GLOBAL", stages);
    return toStrategyDto(strategy);
  }

  async function getBookStrategy(bookId: string): Promise<ModelStrategyDto | null> {
    await assertBookExists(bookId);
    const strategy = await findScopedStrategy("BOOK", bookId);
    return strategy ? toStrategyDto(strategy) : null;
  }

  /**
   * 功能：保存书籍级策略。
   * 输入：书籍 ID 与阶段策略配置。
   * 输出：保存后的书籍策略 DTO。
   * 异常：书籍不存在时抛 `BookNotFoundError`；模型不可用时抛 `ModelStrategyValidationError`。
   * 副作用：写入 `model_strategy_configs`。
   */
  async function saveBookStrategy(bookId: string, stages: StrategyStagesDto): Promise<ModelStrategyDto> {
    await assertBookExists(bookId);
    const strategy = await saveScopedStrategy("BOOK", stages, bookId);
    return toStrategyDto(strategy);
  }

  /**
   * 功能：汇总单个分析任务的模型调用成本。
   * 输入：任务 ID。
   * 输出：按阶段与模型（含 isFallback）聚合的成本 DTO。
   * 异常：任务不存在时抛 `AnalysisJobNotFoundError`。
   * 副作用：读取 `analysis_phase_logs` 与模型表。
   */
  async function getJobCostSummary(jobId: string): Promise<JobCostSummaryDto> {
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: jobId },
      select: { id: true }
    });
    if (!job) {
      throw new AnalysisJobNotFoundError(jobId);
    }

    const logs = await prismaClient.analysisPhaseLog.findMany({
      where  : { jobId },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select : {
        stage           : true,
        chapterId       : true,
        chunkIndex      : true,
        status          : true,
        isFallback      : true,
        promptTokens    : true,
        completionTokens: true,
        durationMs      : true,
        modelId         : true,
        model           : {
          select: {
            name: true
          }
        }
      }
    });

    if (logs.length === 0) {
      return {
        jobId,
        totalPromptTokens    : 0,
        totalCompletionTokens: 0,
        totalDurationMs      : 0,
        totalCalls           : 0,
        failedCalls          : 0,
        fallbackCalls        : 0,
        byStage              : []
      };
    }

    // 关键语义：同一次业务调用可能产生 RETRIED/ERROR/SUCCESS 多条日志。
    // 成本统计必须先按执行键归并，再以“最后一条日志”代表该次调用结果。
    const groupedCalls = new Map<string, PhaseLogRow[]>();
    for (const log of logs) {
      const key = buildExecuteCallKey(log);
      const group = groupedCalls.get(key);
      if (group) {
        group.push(log);
      } else {
        groupedCalls.set(key, [log]);
      }
    }

    const stageAggMap = new Map<string, {
      stage           : string;
      calls           : number;
      promptTokens    : number;
      completionTokens: number;
      successCalls    : number;
      successDuration : number;
      modelAggMap     : Map<string, JobCostSummaryModelItem>;
    }>();

    let totalPromptTokens = 0;
    let totalCompletionTokens = 0;
    let totalDurationMs = 0;
    let totalCalls = 0;
    let failedCalls = 0;
    let fallbackCalls = 0;

    for (const groupLogs of groupedCalls.values()) {
      if (groupLogs.length === 0) {
        continue;
      }

      const finalLog = groupLogs[groupLogs.length - 1];
      const callPromptTokens = finalLog.promptTokens ?? 0;
      const callCompletionTokens = finalLog.completionTokens ?? 0;
      // 单次调用耗时需要累加过程中的重试耗时，否则会低估真实执行成本。
      const callDurationMs = groupLogs.reduce((sum, log) => sum + (log.durationMs ?? 0), 0);

      totalCalls += 1;
      totalPromptTokens += callPromptTokens;
      totalCompletionTokens += callCompletionTokens;
      totalDurationMs += callDurationMs;

      if (finalLog.status === "ERROR") {
        failedCalls += 1;
      }
      if (finalLog.status === "SUCCESS" && finalLog.isFallback) {
        fallbackCalls += 1;
      }

      const existingStageAgg = stageAggMap.get(finalLog.stage) ?? {
        stage           : finalLog.stage,
        calls           : 0,
        promptTokens    : 0,
        completionTokens: 0,
        successCalls    : 0,
        successDuration : 0,
        modelAggMap     : new Map<string, JobCostSummaryModelItem>()
      };

      existingStageAgg.calls += 1;
      existingStageAgg.promptTokens += callPromptTokens;
      existingStageAgg.completionTokens += callCompletionTokens;
      if (finalLog.status === "SUCCESS") {
        existingStageAgg.successCalls += 1;
        existingStageAgg.successDuration += callDurationMs;
      }

      // 模型维度聚合必须包含 isFallback，避免主模型与兜底模型混在同一桶里。
      const modelKey = `${finalLog.modelId ?? "null"}::${finalLog.isFallback ? "1" : "0"}`;
      const existingModelAgg = existingStageAgg.modelAggMap.get(modelKey) ?? {
        modelId         : finalLog.modelId,
        modelName       : finalLog.model?.name ?? "(已删除)",
        isFallback      : finalLog.isFallback,
        calls           : 0,
        promptTokens    : 0,
        completionTokens: 0
      };
      existingModelAgg.calls += 1;
      existingModelAgg.promptTokens += callPromptTokens;
      existingModelAgg.completionTokens += callCompletionTokens;
      existingStageAgg.modelAggMap.set(modelKey, existingModelAgg);

      stageAggMap.set(finalLog.stage, existingStageAgg);
    }

    const stageOrder = new Map<string, number>(
      [...BUSINESS_PIPELINE_STAGES, PipelineStage.FALLBACK].map((stage, index) => [stage, index])
    );

    const byStage: JobCostSummaryStageItem[] = Array.from(stageAggMap.values())
      .sort((a, b) => {
        const orderA = stageOrder.get(a.stage) ?? Number.MAX_SAFE_INTEGER;
        const orderB = stageOrder.get(b.stage) ?? Number.MAX_SAFE_INTEGER;
        if (orderA !== orderB) {
          return orderA - orderB;
        }
        return a.stage.localeCompare(b.stage);
      })
      .map((stageAgg) => ({
        stage           : stageAgg.stage,
        calls           : stageAgg.calls,
        promptTokens    : stageAgg.promptTokens,
        completionTokens: stageAgg.completionTokens,
        avgDurationMs   : stageAgg.successCalls > 0 ? stageAgg.successDuration / stageAgg.successCalls : 0,
        models          : Array.from(stageAgg.modelAggMap.values()).sort((a, b) => b.calls - a.calls)
      }));

    return {
      jobId,
      totalPromptTokens,
      totalCompletionTokens,
      totalDurationMs,
      totalCalls,
      failedCalls,
      fallbackCalls,
      byStage
    };
  }

  return {
    getGlobalStrategy,
    saveGlobalStrategy,
    getBookStrategy,
    saveBookStrategy,
    getJobCostSummary
  };
}

export type ModelStrategyAdminService = ReturnType<typeof createModelStrategyAdminService>;
export const modelStrategyAdminService = createModelStrategyAdminService(prisma);

/**
 * 功能：读取全局模型策略。
 * 输入：无。
 * 输出：全局策略 DTO 或 `null`。
 * 异常：服务层异常向上抛出。
 * 副作用：读取数据库。
 */
export async function getGlobalStrategy(): Promise<ModelStrategyDto | null> {
  return modelStrategyAdminService.getGlobalStrategy();
}

/**
 * 功能：保存全局模型策略。
 * 输入：阶段策略配置。
 * 输出：保存后的全局策略 DTO。
 * 异常：服务层异常向上抛出。
 * 副作用：写入数据库。
 */
export async function saveGlobalStrategy(stages: StrategyStagesDto): Promise<ModelStrategyDto> {
  return modelStrategyAdminService.saveGlobalStrategy(stages);
}

/**
 * 功能：读取书籍模型策略。
 * 输入：书籍 ID。
 * 输出：书籍策略 DTO 或 `null`。
 * 异常：服务层异常向上抛出。
 * 副作用：读取数据库。
 */
export async function getBookStrategy(bookId: string): Promise<ModelStrategyDto | null> {
  return modelStrategyAdminService.getBookStrategy(bookId);
}

/**
 * 功能：保存书籍模型策略。
 * 输入：书籍 ID 与阶段策略配置。
 * 输出：保存后的书籍策略 DTO。
 * 异常：服务层异常向上抛出。
 * 副作用：写入数据库。
 */
export async function saveBookStrategy(bookId: string, stages: StrategyStagesDto): Promise<ModelStrategyDto> {
  return modelStrategyAdminService.saveBookStrategy(bookId, stages);
}

/**
 * 功能：读取任务成本汇总。
 * 输入：分析任务 ID。
 * 输出：任务成本聚合 DTO。
 * 异常：服务层异常向上抛出。
 * 副作用：读取数据库。
 */
export async function getJobCostSummary(jobId: string): Promise<JobCostSummaryDto> {
  return modelStrategyAdminService.getJobCostSummary(jobId);
}
