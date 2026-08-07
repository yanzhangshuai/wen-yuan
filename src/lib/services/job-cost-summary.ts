/**
 * ============================================================================
 * 文件定位：`src/lib/services/job-cost-summary.ts`
 * ----------------------------------------------------------------------------
 * 这是“分析任务成本汇总”的前端服务层（Client-side Service）。
 * v5 阶段 4（08-07-v5-skill-loading）：原 `lib/services/model-strategy.ts` 随 v4 阶段模型策略
 * 删除，其中与模型策略无关的“任务成本汇总”能力迁移到本文件，供书籍详情任务面板消费。
 * ============================================================================
 */
import { clientFetch } from "@/lib/client-api";

export interface JobCostSummaryModelItem {
  /** 模型 ID。历史数据兼容场景下可能为空。 */
  modelId         : string | null;
  /** 展示用模型名称。 */
  modelName       : string;
  /** 是否属于 fallback 调用（主模型失败后的降级调用）。 */
  isFallback      : boolean;
  /** 调用次数。 */
  calls           : number;
  /** 输入 token 总量。 */
  promptTokens    : number;
  /** 输出 token 总量。 */
  completionTokens: number;
}

export interface JobCostSummaryStageItem {
  /** 阶段标识（featureKey/stageLabel，例如 SKILL_SELECTOR、PIPELINE_MAIN）。 */
  stage           : string;
  /** 该阶段总调用次数。 */
  calls           : number;
  /** 该阶段输入 token 总量。 */
  promptTokens    : number;
  /** 该阶段输出 token 总量。 */
  completionTokens: number;
  /** 平均耗时（毫秒）。 */
  avgDurationMs   : number;
  /** 阶段内按模型聚合的成本明细。 */
  models          : JobCostSummaryModelItem[];
}

export interface JobCostSummary {
  /** 分析任务 ID。 */
  jobId                : string;
  /** 任务全链路输入 token 总量。 */
  totalPromptTokens    : number;
  /** 任务全链路输出 token 总量。 */
  totalCompletionTokens: number;
  /** 任务全链路耗时（毫秒）。 */
  totalDurationMs      : number;
  /** 任务总调用次数。 */
  totalCalls           : number;
  /** 失败调用次数。 */
  failedCalls          : number;
  /** fallback 调用次数。 */
  fallbackCalls        : number;
  /** 按阶段聚合的成本明细。 */
  byStage              : JobCostSummaryStageItem[];
}

/**
 * 获取任务成本概览（按阶段 + 模型聚合，含 fallback 标记）。
 *
 * @param jobId 任务 ID。
 * @returns `JobCostSummary`，用于成本可视化面板展示。
 */
export async function fetchJobCostSummary(jobId: string): Promise<JobCostSummary> {
  return clientFetch<JobCostSummary>(
    `/api/admin/analysis-jobs/${encodeURIComponent(jobId)}/cost-summary`,
    { cache: "no-store" }
  );
}
