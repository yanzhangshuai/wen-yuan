import type { AnalysisArchitecture as SharedAnalysisArchitecture } from "@/types/analysis-pipeline";

/**
 * 文件定位（分析域编排抽象层）：
 * - 本文件定义 analysis pipelines 的共享契约，位于 jobs 与 services 之间。
 * - 它的目标不是承载业务逻辑，而是先把“按架构选择执行器”的边界固定下来。
 *
 * 当前阶段定位：
 * - Phase 1 只建立统一接口与目录结构，不直接接管现有运行链路；
 * - 后续 Phase 2/3 会分别把 sequential / twopass 的真实编排逻辑迁入该层。
 */

/** 支持的解析架构枚举。默认架构由上游调用方决定，当前仅在类型层收敛可选值。 */
export type AnalysisArchitecture = SharedAnalysisArchitecture;

/**
 * 管线层只依赖最小章节载荷，避免把 jobs 层的数据库查询细节泄漏到实现边界内。
 */
export interface PipelineChapterTask {
  id: string;
  no: number;
}

/**
 * 统一的进度回调载荷。
 * jobs 层仍掌握实际的书籍/任务状态写回方式，pipeline 只报告自己推进到了哪一步。
 */
export interface PipelineProgressUpdate {
  progress     : number;
  stage        : string;
  doneCount    : number;
  totalChapters: number;
}

/**
 * Pipeline.run 的共享入参。
 * 把取消检查与进度写回显式收口为回调，便于后续在测试中独立 mock。
 */
export interface PipelineRunParams {
  jobId     : string;
  bookId    : string;
  chapters  : PipelineChapterTask[];
  isCanceled: () => Promise<boolean>;
  onProgress: (update: PipelineProgressUpdate) => Promise<void>;
}

export interface AnalysisPipelineWarning {
  code    : string;
  stage   : string;
  message : string;
  details?: Record<string, number | string | boolean | null>;
}

export interface AnalysisPipelineStageSummary {
  stage  : string;
  status : "SUCCESS" | "WARNING";
  metrics: Record<string, number | string | boolean | null>;
}

/**
 * 管线执行结果目前只保留章节级统计。
 * 保持结果窄而稳定，避免在 Phase 1 过早把实现细节固化进跨文件契约。
 */
export interface AnalysisPipelineResult {
  completedChapters: number;
  failedChapters   : number;
  warnings         : AnalysisPipelineWarning[];
  stageSummaries   : AnalysisPipelineStageSummary[];
}

/**
 * 统一的解析管线接口。
 * `architecture` 用于让 jobs 层和测试直接识别当前实例归属，`run` 负责完整执行该架构的主流程。
 */
export interface AnalysisPipeline {
  readonly architecture: AnalysisArchitecture;
  run(params: PipelineRunParams): Promise<AnalysisPipelineResult>;
}
