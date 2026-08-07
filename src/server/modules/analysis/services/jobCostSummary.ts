/**
 * 文件定位（分析服务：任务成本汇总）
 * =============================================================================
 * 汇总分析任务阶段日志，供 `/api/admin/analysis-jobs/:jobId/cost-summary` 消费。
 * 成本数据来自 `analysis_phase_logs`（stage 存调用方传入的阶段标识），不依赖任何策略表。
 *
 * 核心职责：
 * - 汇总分析任务阶段日志，输出按阶段/模型聚合的 token 与耗时成本；
 * - 成本统计按“同一调用键最终结果”归并，避免重试日志重复计数。
 */

import { type PrismaClient } from "@/generated/prisma/client";

import { prisma } from "@/server/db/prisma";

interface PhaseLogRow {
  stage           : string;
  chapterId       : string | null;
  chunkIndex      : number | null;
  status          : string;
  isFallback      : boolean;
  promptTokens    : number | null;
  completionTokens: number | null;
  durationMs      : number | null;
  modelId         : string | null;
  model           : {
    name: string;
  } | null;
}

export interface JobCostSummaryModelItem {
  modelId         : string | null;
  modelName       : string;
  isFallback      : boolean;
  calls           : number;
  promptTokens    : number;
  completionTokens: number;
}

export interface JobCostSummaryStageItem {
  stage           : string;
  calls           : number;
  promptTokens    : number;
  completionTokens: number;
  avgDurationMs   : number;
  models          : JobCostSummaryModelItem[];
}

export interface JobCostSummaryDto {
  jobId                : string;
  totalPromptTokens    : number;
  totalCompletionTokens: number;
  totalDurationMs      : number;
  totalCalls           : number;
  failedCalls          : number;
  fallbackCalls        : number;
  byStage              : JobCostSummaryStageItem[];
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
 * 功能：汇总单个分析任务的模型调用成本。
 * 输入：任务 ID。
 * 输出：按阶段与模型（含 isFallback）聚合的成本 DTO。
 * 异常：任务不存在时抛 `AnalysisJobNotFoundError`。
 * 副作用：读取 `analysis_phase_logs` 与模型表。
 */
export async function getJobCostSummary(
  jobId: string,
  prismaClient: PrismaClient = prisma
): Promise<JobCostSummaryDto> {
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

  // byStage 按阶段首次出现顺序展示（Map 保插入序，即日志出现顺序）。
  const byStage: JobCostSummaryStageItem[] = Array.from(stageAggMap.values())
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
