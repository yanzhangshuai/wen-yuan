/**
 * =============================================================================
 * 文件定位（服务端分析模块 - 词典与个性化判定规则）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/config/lexicon.ts`
 *
 * 在 Next.js 项目中的角色：
 * - 属于服务端业务逻辑层（`src/server/modules`），由分析流水线在 Node.js 侧调用；
 * - 不直接暴露路由，不运行于浏览器，主要为实体识别/别名归一化提供规则集。
 *
 * 核心业务目标：
 * - 区分“泛称（如老爷、夫人）”与“可个体化指代”；
 * - 把全局默认词典与书籍级配置合并，生成当前分析任务可用的有效词典。
 *
 * 重要说明：
 * - 这里的词表与阈值是业务规则，不是技术限制；
 * - 修改会直接影响实体抽取精度与审核成本，需配合回归样本验证。
 * =============================================================================
 */

export interface BookLexiconConfig {
  /** 书籍私有的泛称补充列表（在默认集合上追加）。 */
  additionalGenericTitles?     : string[];
  /** 书籍私有的泛称豁免列表（从最终泛称集合中移除）。 */
  exemptGenericTitles?         : string[];
  /** 硬阻断关系后缀补充（例如“之父”“之妻”这类关系词尾）。 */
  additionalRelationalSuffixes?: string[];
  /** 软阻断关系后缀补充（语义偏头衔/称谓，需结合上下文判断）。 */
  softRelationalSuffixes?      : string[];
  /** 额外头衔模式补充（用于 titlePattern）。 */
  additionalTitlePatterns?     : string[];
  /** 额外职位模式补充（用于 positionPattern）。 */
  additionalPositionPatterns?  : string[];
}

export interface MentionPersonalizationEvidence {
  /** 当前提及的原始文本。 */
  surfaceForm             : string;
  /** 是否已有稳定别名绑定（来自别名注册或人工确认）。 */
  hasStableAliasBinding   : boolean;
  /** 在章节维度的出现次数。 */
  chapterAppearanceCount  : number;
  /** 是否稳定指向同一人物。 */
  singlePersonaConsistency: boolean;
  /** 被识别为泛称的比例（0~1）。 */
  genericRatio            : number;
}

/** 个性化判定分层结果。 */
export type PersonalizationTier = "personalized" | "generic" | "gray_zone";

export interface EffectiveLexicon {
  /** 当前任务有效的泛称集合（通常不含 safety 集合）。 */
  genericTitles    : Set<string>;
  /** 强阻断后缀：命中后基本判定为关系词，不视为个体称谓。 */
  hardBlockSuffixes: Set<string>;
  /** 软阻断后缀：命中后需结合别名/上下文进一步判断。 */
  softBlockSuffixes: Set<string>;
  /** 头衔匹配正则。 */
  titlePattern     : RegExp;
  /** 职位匹配正则。 */
  positionPattern  : RegExp;
}

export const SAFETY_GENERIC_TITLES = new Set([
  "此人", "那人", "来人", "众人", "旁人", "大家", "诸人", "某人", "一人",
  "他", "她", "他们", "她们", "吾", "汝", "彼", "尔",
  "父亲", "母亲", "老父", "老母", "老娘", "娘亲",
  "兄长", "兄弟", "姐姐", "弟弟", "妹妹", "妻子",
  "丫鬟", "丫头", "奴婢", "仆人", "仆役", "家丁", "下人", "小厮", "书童"
]);

export const DEFAULT_GENERIC_TITLES = new Set([
  "老爷", "夫人", "太太", "老太太", "小姐", "少爷", "公子", "相公", "娘子", "先生",
  "掌柜", "掌柜的", "账房", "管家", "老管家", "门房", "门子",
  "书办", "掌舵", "按察司", "布政司", "都司", "参将", "千总", "把总",
  "员外", "举人", "秀才", "进士", "状元", "老学究"
]);

export const HARD_BLOCK_SUFFIXES = new Set([
  "父亲", "母亲", "儿子", "女儿", "之妻", "之子", "之父", "之母", "老爹", "老娘"
]);

export const DEFAULT_SOFT_BLOCK_SUFFIXES = new Set([
  "大人", "将军", "老爷", "先生", "娘子", "太太", "夫人",
  "兄弟", "兄长", "弟弟", "姐姐", "妹妹"
]);

export const UNIVERSAL_TITLE_STEMS = ["皇帝", "太后", "太祖", "太宗", "国王", "王后", "太子", "公主", "吴王", "国公"];

export const DEFAULT_POSITION_STEMS = [
  "丞相", "太守", "知府", "知县", "尚书", "侍郎", "将军", "巡抚", "总督", "学道"
];

function escapeRegex(value: string): string {
  // 防止词项中的正则元字符污染整体 pattern。
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toUniqueSortedList(values: Iterable<string>): string[] {
  // 统一做 trim + 去空 + 去重 + 排序，保证规则构建输出稳定可复现。
  return Array.from(new Set(Array.from(values).map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export function buildEffectiveGenericTitles(bookConfig?: BookLexiconConfig, includeSafety = true): Set<string> {
  const merged = new Set<string>([
    ...(includeSafety ? Array.from(SAFETY_GENERIC_TITLES) : []),
    ...Array.from(DEFAULT_GENERIC_TITLES),
    ...(bookConfig?.additionalGenericTitles ?? [])
  ]);

  for (const item of bookConfig?.exemptGenericTitles ?? []) {
    // 允许针对单书“豁免”某些泛称，解决文本风格差异导致的误判。
    merged.delete(item.trim());
  }

  return new Set(toUniqueSortedList(merged));
}

export function buildEffectiveSoftBlockSuffixes(bookConfig?: BookLexiconConfig): Set<string> {
  return new Set(toUniqueSortedList([
    ...Array.from(DEFAULT_SOFT_BLOCK_SUFFIXES),
    ...(bookConfig?.softRelationalSuffixes ?? [])
  ]));
}

export function buildEffectiveHardBlockSuffixes(bookConfig?: BookLexiconConfig): Set<string> {
  return new Set(toUniqueSortedList([
    ...Array.from(HARD_BLOCK_SUFFIXES),
    ...(bookConfig?.additionalRelationalSuffixes ?? [])
  ]));
}

export function buildEffectiveTitlePattern(bookConfig?: BookLexiconConfig): RegExp {
  const stems = toUniqueSortedList([
    ...UNIVERSAL_TITLE_STEMS,
    ...DEFAULT_POSITION_STEMS,
    ...(bookConfig?.additionalTitlePatterns ?? []),
    ...(bookConfig?.additionalPositionPatterns ?? [])
  ]);
  // 空列表返回永不匹配正则，避免构造 `new RegExp("()$")` 造成误命中。
  if (stems.length === 0) return /(?!)/;
  return new RegExp(`(${stems.map(escapeRegex).join("|")})$`);
}

export function buildEffectivePositionPattern(bookConfig?: BookLexiconConfig): RegExp {
  const stems = toUniqueSortedList([
    ...DEFAULT_POSITION_STEMS,
    ...(bookConfig?.additionalPositionPatterns ?? [])
  ]);
  // 与 titlePattern 保持一致的空集防御策略。
  if (stems.length === 0) return /(?!)/;
  return new RegExp(`(${stems.map(escapeRegex).join("|")})$`);
}

export function buildEffectiveLexicon(bookConfig?: BookLexiconConfig): EffectiveLexicon {
  return {
    // 注意：分析阶段默认不包含 SAFETY_GENERIC_TITLES，避免过度保守导致召回下降。
    // 这是当前策略选择，若要变更需联动评估精准率/召回率。
    genericTitles    : buildEffectiveGenericTitles(bookConfig, false),
    hardBlockSuffixes: buildEffectiveHardBlockSuffixes(bookConfig),
    softBlockSuffixes: buildEffectiveSoftBlockSuffixes(bookConfig),
    titlePattern     : buildEffectiveTitlePattern(bookConfig),
    positionPattern  : buildEffectivePositionPattern(bookConfig)
  };
}

export function classifyPersonalization(evidence: MentionPersonalizationEvidence): PersonalizationTier {
  // 规则 1：有稳定别名且指向一致 -> 直接判定个性化。
  if (evidence.hasStableAliasBinding && evidence.singlePersonaConsistency) {
    return "personalized";
  }

  // 规则 2：无稳定别名且泛称占比高 -> 归类为泛化称呼。
  if (!evidence.hasStableAliasBinding && evidence.genericRatio >= 0.7) {
    return "generic";
  }

  // 规则 3：其余灰区交由后续流程（模型或人工）继续判定。
  return "gray_zone";
}
