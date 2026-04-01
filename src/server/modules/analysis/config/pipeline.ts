/**
 * 人物解析链路统一配置。
 * 说明：集中关键阈值与并发参数，避免多处硬编码导致“改一半”风险。
 */
export const ANALYSIS_PIPELINE_CONFIG = {
  /** AliasRegistry 命中阈值：0.75 以下不参与实体快速归并。 */
  aliasRegistryMinConfidence: 0.75,
  /** 多信号实体合并阈值。 */
  personaResolveMinScore    : 0.72,
  /** Chunk 并发。 */
  chunkAiConcurrency        : 3,
  /** 章节间并发。 */
  chapterConcurrency        : 1,
  /** 增量称号溯源触发间隔（按成功章节数）。 */
  incrementalResolveInterval: 5,
  /** 章节校验重试次数（不含首次）。 */
  chapterValidationRetries  : 1,
  /** 全书验证原文抽样条数上限。 */
  bookValidationSampleLimit : 6,
  /** 全书验证单条原文抽样最大字符数。 */
  bookValidationExcerptChars: 280
} as const;
