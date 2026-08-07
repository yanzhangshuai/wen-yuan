/**
 * 文件定位（跨层共享：解析架构类型）：
 * - v5 精简：startBookAnalysis 与 analyze route 已不再消费 architecture（v4 双架构删除）。
 * - 本导出暂保留给前端 model-strategy-form 等 v4 遗留组件；阶段 4/5 清理前端时一并移除。
 */

/** 支持的解析架构枚举值（v4 遗留，前端仍引用；v5 单管线不再使用）。 */
export const ANALYSIS_ARCHITECTURE_VALUES = ["sequential", "twopass"] as const;

/** 解析架构类型（v4 遗留）。 */
export type AnalysisArchitecture = (typeof ANALYSIS_ARCHITECTURE_VALUES)[number];
