export interface BookLexiconConfig {
  additionalGenericTitles?     : string[];
  exemptGenericTitles?         : string[];
  additionalRelationalSuffixes?: string[];
  softRelationalSuffixes?      : string[];
  additionalTitlePatterns?     : string[];
  additionalPositionPatterns?  : string[];
}

export interface MentionPersonalizationEvidence {
  surfaceForm             : string;
  hasStableAliasBinding   : boolean;
  chapterAppearanceCount  : number;
  singlePersonaConsistency: boolean;
  genericRatio            : number;
}

export type PersonalizationTier = "personalized" | "generic" | "gray_zone";

export interface EffectiveLexicon {
  genericTitles    : Set<string>;
  hardBlockSuffixes: Set<string>;
  softBlockSuffixes: Set<string>;
  titlePattern     : RegExp;
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
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toUniqueSortedList(values: Iterable<string>): string[] {
  return Array.from(new Set(Array.from(values).map((item) => item.trim()).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-Hans-CN"));
}

export function buildEffectiveGenericTitles(bookConfig?: BookLexiconConfig, includeSafety = true): Set<string> {
  const merged = new Set<string>([
    ...(includeSafety ? Array.from(SAFETY_GENERIC_TITLES) : []),
    ...Array.from(DEFAULT_GENERIC_TITLES),
    ...(bookConfig?.additionalGenericTitles ?? [])
  ]);

  for (const item of bookConfig?.exemptGenericTitles ?? []) {
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
  if (stems.length === 0) return /(?!)/;
  return new RegExp(`(${stems.map(escapeRegex).join("|")})$`);
}

export function buildEffectivePositionPattern(bookConfig?: BookLexiconConfig): RegExp {
  const stems = toUniqueSortedList([
    ...DEFAULT_POSITION_STEMS,
    ...(bookConfig?.additionalPositionPatterns ?? [])
  ]);
  if (stems.length === 0) return /(?!)/;
  return new RegExp(`(${stems.map(escapeRegex).join("|")})$`);
}

export function buildEffectiveLexicon(bookConfig?: BookLexiconConfig): EffectiveLexicon {
  return {
    genericTitles    : buildEffectiveGenericTitles(bookConfig, false),
    hardBlockSuffixes: buildEffectiveHardBlockSuffixes(bookConfig),
    softBlockSuffixes: buildEffectiveSoftBlockSuffixes(bookConfig),
    titlePattern     : buildEffectiveTitlePattern(bookConfig),
    positionPattern  : buildEffectivePositionPattern(bookConfig)
  };
}

export function classifyPersonalization(evidence: MentionPersonalizationEvidence): PersonalizationTier {
  if (evidence.hasStableAliasBinding && evidence.singlePersonaConsistency) {
    return "personalized";
  }

  if (!evidence.hasStableAliasBinding && evidence.genericRatio >= 0.7) {
    return "generic";
  }

  return "gray_zone";
}
