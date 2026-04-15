/**
 * =============================================================================
 * 文件定位（服务端分析模块 - 流水线配置）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/config/pipeline.ts`
 *
 * 本文件在配置目录中的定位：
 * ┌─ config/
 * │  ├─ pipeline.ts         ← 本文件：流水线阈值、并发、特性开关
 * │  ├─ lexicon.ts          ← NER 词典规则：姓氏表、泛称集合、提取规则、个性化判定
 *
 * 核心职责：
 * - 集中管理分析流水线的运行参数（并发、阈值、分片大小、特性开关等）。
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
  dynamicTitleResolutionEnabled : true,
  /** Phase 3：是否启用全书末灰区 AI 仲裁。 */
  llmTitleArbitrationEnabled    : true,
  /** soft-block 后缀降权系数，最终分值 = normalScore × penalty。 */
  softBlockPenalty              : 0.4,
  /** 全书一次仲裁最多提交的灰区称谓数。 */
  llmArbitrationMaxTerms        : 20,
  /** 仲裁结果进入 LLM_INFERRED 的最低置信度。 */
  llmArbitrationMinConfidence   : 0.7,
  /** 单次全书分析中 LLM 仲裁最大调用次数（成本安全阀）。 */
  llmArbitrationMaxCalls        : 100,
  /** 灰区判定置信度窗口 [下界, 上界]，落入此区间的称谓进入灰区仲裁流程。 */
  llmArbitrationGrayZone        : [0.4, 0.6] as const,
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
