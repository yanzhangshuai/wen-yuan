import type { BookLexiconConfig } from "@/server/modules/analysis/config/lexicon";

/**
 * =============================================================================
 * 文件定位（服务端分析模块 - 流水线配置与书籍类型预设）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/config/pipeline.ts`
 *
 * 本文件在配置目录中的定位：
 * ┌─ config/
 * │  ├─ pipeline.ts         ← 本文件：流水线阈值、并发、特性开关 + 书籍类型预设词表覆盖
 * │  ├─ lexicon.ts          ← NER 词典规则：姓氏表、泛称集合、提取规则、个性化判定
 * │  └─ classical-names.ts  ← 古典文学字号/谥号/绰号知识库（用于 Pass 2 规则预合并）
 *
 * 核心职责：
 * - 集中管理分析流水线的运行参数（并发、阈值、分片大小、特性开关等）；
 * - 维护书籍类型预设（GENRE_PRESETS），为不同类型古典文学提供定制化词表覆盖。
 *
 * 维护边界（重要）：
 * - 这些值直接影响召回率、精度、成本和时延，是业务规则，不是纯技术参数。
 * - 修改前应结合离线评估与线上回归，避免"看似小改动"引发识别质量波动。
 * =============================================================================
 */

/**
 * 人物解析链路统一配置。
 * 说明：集中关键阈值与并发参数，避免多处硬编码导致“改一半”风险。
 */
export const ANALYSIS_PIPELINE_CONFIG = {
  /** AliasRegistry 命中阈值：0.75 以下不参与实体快速归并。 */
  aliasRegistryMinConfidence    : 0.75,
  /** 多信号实体合并阈值。 */
  personaResolveMinScore        : 0.72,
  /** Phase 2 单片输入长度。 */
  maxChunkLength                : 10000,
  /** Phase 2 相邻分片重叠长度。 */
  chunkOverlap                  : 800,
  /** Phase 1 触发长章节分片保护的阈值。 */
  rosterMaxInputLength          : 20000,
  /** Phase 1 长章节分片大小。 */
  rosterChunkSize               : 15000,
  /** Phase 1 长章节分片重叠。 */
  rosterChunkOverlap            : 2000,
  /** Chunk 并发。 */
  chunkAiConcurrency            : 3,
  /** 章节间并发。 */
  chapterConcurrency            : 2,
  /** 增量称号溯源触发间隔（按成功章节数）。 */
  incrementalResolveInterval    : 5,
  /** 章节校验重试次数（不含首次）。 */
  chapterValidationRetries      : 1,
  /** 全书验证原文抽样条数上限。 */
  bookValidationSampleLimit     : 6,
  /** 全书验证单条原文抽样最大字符数。 */
  bookValidationExcerptChars    : 280,
  /** Phase 2：是否启用 generic 称谓动态分档门控。 */
  dynamicTitleResolutionEnabled : false,
  /** Phase 3：是否启用全书末灰区 AI 仲裁。 */
  llmTitleArbitrationEnabled    : false,
  /** soft-block 后缀降权系数，最终分值 = normalScore × penalty。 */
  softBlockPenalty              : 0.4,
  /** 全书一次仲裁最多提交的灰区称谓数。 */
  llmArbitrationMaxTerms        : 20,
  /** 仲裁结果进入 LLM_INFERRED 的最低置信度。 */
  llmArbitrationMinConfidence   : 0.7,
  /** 是否允许按书籍类型预设覆盖默认词表。 */
  enableGenrePresetOverride     : true,
  /** 是否记录灰区提及用于后处理仲裁。 */
  recordGrayZoneMentions        : true,
  /**
   * [Cost opt C] profiles 兜底层大小：即使 roster 未命中，也始终包含前 N 个人物 profile。
   * 这些 profile 对应最早创建的人物（通常是核心角色），防止 ROSTER 偶发漏识别时产生实体重复。
   * 设置为 0 = 纯硬过滤（不保留兜底，风险较高）。
   */
  chunkProfileFloor             : 15,
  /**
   * [Cost opt D] 章节校验风险门控阈值。
   * 只有当 章节新建 persona 数 >= 此值 或 存在 hallucination/grayZone 时，
   * 才触发同步 CHAPTER_VALIDATION；低风险章节跳过以节省 token 与时延。
   * 设置为 0 = 每章都校验（原始行为）。
   */
  chapterValidationRiskThreshold: 3
} as const;

/**
 * 默认书籍类型预设名称。
 * - 作为词表/规则覆盖的默认入口；
 * - 当书籍未显式指定书籍类型时使用。
 */
export const DEFAULT_GENRE_PRESET = "明清官场";

/**
 * 书籍类型预设词表覆盖。
 *
 * 字段业务语义：
 * - `exemptGenericTitles`：豁免的“通用称谓”，避免被过度过滤；
 * - `additionalTitlePatterns`：补充称谓模式，提升特定书籍类型召回；
 * - `additionalPositionPatterns`：补充职位模式，增强角色关系识别。
 *
 * 备注：
 * - 这里的键名（如“武侠”“宫廷家族”）会被上游书籍类型选择逻辑引用，随意改名会导致预设失效。
 */
export const GENRE_PRESETS: Record<string, BookLexiconConfig> = {
  明清官场: {},
  武侠  : {
    exemptGenericTitles       : ["掌门", "帮主", "盟主", "先生", "公子"],
    additionalTitlePatterns   : ["掌门", "盟主", "帮主", "长老", "护法"],
    additionalPositionPatterns: ["堂主"]
  },
  宫廷家族: {
    exemptGenericTitles: ["夫人", "太太", "老爷", "小姐", "公子"]
  },
  // 水浒传类：绰号保护 + 武职称号
  英雄传奇: {
    exemptGenericTitles       : ["好汉", "头领", "教头", "员外"],
    additionalTitlePatterns   : ["员外", "教头", "都头", "押司", "提辖", "制使"],
    additionalPositionPatterns: ["节级", "管营", "团练"]
  },
  // 三国演义类：字号/谥号保护 + 军政职位
  历史演义: {
    exemptGenericTitles       : ["丞相", "军师", "主公"],
    additionalTitlePatterns   : ["太守", "刺史", "都督", "国舅", "驸马"],
    additionalPositionPatterns: ["司马", "司徒", "廷尉", "长史", "从事"]
  },
  // 红楼梦类：辈分称呼保护
  家族世情: {
    exemptGenericTitles   : ["姑娘", "奶奶", "姐姐", "妹妹", "嫂子", "婶子"],
    softRelationalSuffixes: ["哥哥", "姐姐"]
  },
  // 西游记类：法号/本相/神魔称号
  神魔小说: {
    exemptGenericTitles       : ["大王", "大圣", "长老", "法师"],
    additionalTitlePatterns   : ["菩萨", "真人", "尊者", "天王", "星君", "元帅"],
    additionalPositionPatterns: ["土地", "山神", "龙王"]
  }
};
