import { z } from "zod";

import { PipelineStage } from "@/types/pipeline";

/**
 * 文件定位：
 * - AI 解析模块的 DTO 与运行时校验定义，位于服务端“数据契约层”。
 * - 主要服务于“模型策略配置”的读写与校验：把外部输入（接口、数据库 JSON）约束成稳定结构。
 *
 * 上下游关系：
 * - 上游：管理端接口请求体、数据库持久化字段。
 * - 下游：分析流水线执行器按 stage 读取具体模型参数。
 *
 * 维护边界：
 * - 这些 schema 与 type 是跨模块契约，不仅是类型提示；变更会影响配置保存、回放与运行时行为。
 */

/**
 * 单阶段模型配置 Schema。
 * 每个字段都围绕“同一阶段如何调用模型”展开。
 */
export const stageModelConfigSchema = z.object({
  /** 模型主键（UUID），指向运营端已配置模型。 */
  modelId        : z.string().uuid(),
  /** 采样温度：越高越发散，越低越稳定；按 OpenAI/兼容协议常见范围 0~2 约束。 */
  temperature    : z.number().min(0).max(2).optional(),
  /** 输出 token 上限，防止模型超长输出拖慢任务或增加成本。 */
  maxOutputTokens: z.number().int().min(256).max(65536).optional(),
  /** Top-p 采样阈值，控制候选概率质量。 */
  topP           : z.number().min(0).max(1).optional(),
  /** 是否启用“思考”模式（面向支持该能力的模型）。 */
  enableThinking : z.boolean().optional(),
  /** 推理强度档位：用于平衡延迟、成本与质量。 */
  reasoningEffort: z.enum(["low", "medium", "high"]).optional(),
  /** 失败重试次数（不含首次请求）。 */
  maxRetries     : z.number().int().min(0).max(5).optional(),
  /** 重试退避基础毫秒数，避免瞬时雪崩重试。 */
  retryBaseMs    : z.number().int().min(100).max(10000).optional()
});

/**
 * 全链路阶段策略 Schema。
 * - key 直接使用 `PipelineStage` 枚举，确保“配置键名”与“执行阶段”一一对应，避免字符串漂移。
 * - 每个阶段可选：未配置时由执行层回退默认策略，这是业务规则，不是技术限制。
 */
export const strategyStagesSchema = z.object({
  [PipelineStage.ROSTER_DISCOVERY]       : stageModelConfigSchema.optional(),
  [PipelineStage.CHUNK_EXTRACTION]       : stageModelConfigSchema.optional(),
  [PipelineStage.CHAPTER_VALIDATION]     : stageModelConfigSchema.optional(),
  [PipelineStage.TITLE_RESOLUTION]       : stageModelConfigSchema.optional(),
  [PipelineStage.GRAY_ZONE_ARBITRATION]  : stageModelConfigSchema.optional(),
  [PipelineStage.BOOK_VALIDATION]        : stageModelConfigSchema.optional(),
  [PipelineStage.INDEPENDENT_EXTRACTION] : stageModelConfigSchema.optional(),
  [PipelineStage.ENTITY_RESOLUTION]      : stageModelConfigSchema.optional(),
  [PipelineStage.FALLBACK]               : stageModelConfigSchema.optional()
});

/**
 * 策略作用域：
 * - GLOBAL：全局默认策略；
 * - BOOK：某本书专属策略；
 * - JOB：单任务临时覆盖策略。
 */
export const modelStrategyScopeSchema = z.enum(["GLOBAL", "BOOK", "JOB"]);

export type ModelStrategyScope = z.infer<typeof modelStrategyScopeSchema>;
export type StageModelConfigDto = z.infer<typeof stageModelConfigSchema>;
export type StrategyStagesDto = z.infer<typeof strategyStagesSchema>;

export interface ModelStrategyDto {
  /** 策略记录主键。 */
  id       : string;
  /** 生效范围（全局/书籍/任务）。 */
  scope    : ModelStrategyScope;
  /** 书籍维度绑定 ID；仅当 scope=BOOK 时通常非空。 */
  bookId   : string | null;
  /** 任务维度绑定 ID；仅当 scope=JOB 时通常非空。 */
  jobId    : string | null;
  /** 分阶段模型策略配置集合。 */
  stages   : StrategyStagesDto;
  /** 创建时间（ISO 字符串）。 */
  createdAt: string;
  /** 最近更新时间（ISO 字符串）。 */
  updatedAt: string;
}
