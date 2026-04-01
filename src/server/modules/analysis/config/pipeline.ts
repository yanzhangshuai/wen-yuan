import type { BookLexiconConfig } from "@/server/modules/analysis/config/lexicon";

/**
 * 人物解析链路统一配置。
 * 说明：集中关键阈值与并发参数，避免多处硬编码导致“改一半”风险。
 */
export const ANALYSIS_PIPELINE_CONFIG = {
  /** AliasRegistry 命中阈值：0.75 以下不参与实体快速归并。 */
  aliasRegistryMinConfidence   : 0.75,
  /** 多信号实体合并阈值。 */
  personaResolveMinScore       : 0.72,
  /** Chunk 并发。 */
  chunkAiConcurrency           : 3,
  /** 章节间并发。 */
  chapterConcurrency           : 1,
  /** 增量称号溯源触发间隔（按成功章节数）。 */
  incrementalResolveInterval   : 5,
  /** 章节校验重试次数（不含首次）。 */
  chapterValidationRetries     : 1,
  /** 全书验证原文抽样条数上限。 */
  bookValidationSampleLimit    : 6,
  /** 全书验证单条原文抽样最大字符数。 */
  bookValidationExcerptChars   : 280,
  /** Phase 2：是否启用 generic 称谓动态分档门控。 */
  dynamicTitleResolutionEnabled: false,
  /** Phase 3：是否启用全书末灰区 AI 仲裁。 */
  llmTitleArbitrationEnabled   : false,
  /** soft-block 后缀降权系数，最终分值 = normalScore × penalty。 */
  softBlockPenalty             : 0.4,
  /** 全书一次仲裁最多提交的灰区称谓数。 */
  llmArbitrationMaxTerms       : 20,
  /** 仲裁结果进入 LLM_INFERRED 的最低置信度。 */
  llmArbitrationMinConfidence  : 0.7,
  /** 是否允许按体裁预设覆盖默认词表。 */
  enableGenrePresetOverride    : true,
  /** 是否记录灰区提及用于后处理仲裁。 */
  recordGrayZoneMentions       : true
} as const;

export const DEFAULT_GENRE_PRESET = "明清官场";

export const GENRE_PRESETS: Record<string, BookLexiconConfig> = {
  明清官场: {},
  武侠  : {
    exemptGenericTitles       : ["掌门", "帮主", "盟主", "先生", "公子"],
    additionalTitlePatterns   : ["掌门", "盟主", "帮主", "长老", "护法"],
    additionalPositionPatterns: ["堂主"]
  },
  宫廷家族: {
    exemptGenericTitles: ["夫人", "太太", "老爷", "小姐", "公子"]
  }
};
