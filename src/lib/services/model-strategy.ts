/**
 * @module model-strategy
 * @description 管理端模型策略与任务成本概览客户端服务层
 *
 * 封装模型策略相关接口：
 * - 全局策略（GLOBAL）
 * - 书籍策略（BOOK）
 * - 任务成本汇总（cost-summary）
 */
import { clientFetch } from "@/lib/client-api";
import type { PipelineStage } from "@/types/pipeline";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

export interface StageModelConfigInput {
  modelId         : string;
  temperature?    : number;
  maxOutputTokens?: number;
  topP?           : number;
  enableThinking? : boolean;
  reasoningEffort?: "low" | "medium" | "high";
  maxRetries?     : number;
  retryBaseMs?    : number;
}

export type ModelStrategyInput = Partial<Record<PipelineStage, StageModelConfigInput>>;

interface ModelStrategyRecord {
  id       : string;
  scope    : "GLOBAL" | "BOOK" | "JOB";
  bookId   : string | null;
  jobId    : string | null;
  stages   : ModelStrategyInput;
  createdAt: string;
  updatedAt: string;
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

export interface JobCostSummary {
  jobId                : string;
  totalPromptTokens    : number;
  totalCompletionTokens: number;
  totalDurationMs      : number;
  totalCalls           : number;
  failedCalls          : number;
  fallbackCalls        : number;
  byStage              : JobCostSummaryStageItem[];
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */

function unwrapStrategy(record: ModelStrategyRecord | null): ModelStrategyInput | null {
  return record?.stages ?? null;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取全局模型策略（GLOBAL）。
 */
export async function fetchGlobalStrategy(): Promise<ModelStrategyInput | null> {
  const data = await clientFetch<ModelStrategyRecord | null>("/api/admin/model-strategy/global", {
    cache: "no-store"
  });
  return unwrapStrategy(data);
}

/**
 * 保存全局模型策略（GLOBAL）。
 */
export async function saveGlobalStrategy(strategy: ModelStrategyInput): Promise<void> {
  await clientFetch<ModelStrategyRecord>("/api/admin/model-strategy/global", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ stages: strategy })
  });
}

/**
 * 获取书籍模型策略（BOOK）。
 */
export async function fetchBookStrategy(bookId: string): Promise<ModelStrategyInput | null> {
  const data = await clientFetch<ModelStrategyRecord | null>(
    `/api/admin/books/${encodeURIComponent(bookId)}/model-strategy`,
    { cache: "no-store" }
  );
  return unwrapStrategy(data);
}

/**
 * 保存书籍模型策略（BOOK）。
 */
export async function saveBookStrategy(bookId: string, strategy: ModelStrategyInput): Promise<void> {
  await clientFetch<ModelStrategyRecord>(`/api/admin/books/${encodeURIComponent(bookId)}/model-strategy`, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ stages: strategy })
  });
}

/**
 * 获取任务成本概览（按阶段 + 模型聚合，含 fallback 标记）。
 */
export async function fetchJobCostSummary(jobId: string): Promise<JobCostSummary> {
  return clientFetch<JobCostSummary>(
    `/api/admin/analysis-jobs/${encodeURIComponent(jobId)}/cost-summary`,
    { cache: "no-store" }
  );
}
