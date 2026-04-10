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

/**
 * 百家姓常用姓氏表（含常见复姓），覆盖古典文学主要人物姓氏。
 * PersonaResolver 通过此表做"姓+称号"类称谓匹配（如"范举人"→范进），
 * 提升同姓别名对齐准确率，同时避免不同姓人物误合并。
 */
export const CHINESE_SURNAME_LIST: ReadonlySet<string> = new Set([
  // 复姓（优先匹配，避免被单字姓氏截断）
  "欧阳", "司马", "上官", "诸葛", "公孙", "令狐", "皇甫", "尉迟",
  "长孙", "慕容", "夏侯", "轩辕", "端木", "百里", "东方", "南宫", "西门",
  // 单姓（百家姓高频，覆盖古典文学 99%+ 人物）
  "赵", "钱", "孙", "李", "周", "吴", "郑", "王", "冯", "陈",
  "褚", "卫", "蒋", "沈", "韩", "杨", "朱", "秦", "尤", "许",
  "何", "吕", "施", "张", "孔", "曹", "严", "华", "金", "魏",
  "陶", "姜", "戚", "谢", "邹", "喻", "柏", "水", "窦", "章",
  "云", "苏", "潘", "葛", "奚", "范", "彭", "郎", "鲁", "韦",
  "昌", "马", "苗", "凤", "花", "方", "俞", "任", "袁", "柳",
  "刘", "关", "鲍", "史", "唐", "费", "廉", "岑", "薛", "雷",
  "贺", "倪", "汤", "滕", "殷", "罗", "毕", "郝", "安", "常",
  "乐", "于", "时", "傅", "皮", "卞", "齐", "康", "伍", "余",
  "元", "卜", "顾", "孟", "平", "黄", "穆", "萧", "尹", "姚",
  "邵", "湛", "汪", "祁", "毛", "禹", "狄", "米", "贝", "明",
  "臧", "计", "温", "曾", "简", "饶", "文", "寇", "连", "沙",
  "成", "戴", "谈", "宋", "茅", "庞", "熊", "纪", "舒", "屈",
  "项", "祝", "董", "梁", "杜", "阮", "蓝", "闵", "席", "季",
  "强", "贾", "路", "娄", "危", "江", "童", "颜", "郭", "梅",
  "盛", "林", "刁", "钟", "徐", "邱", "骆", "高", "夏", "蔡",
  "田", "樊", "胡", "凌", "霍", "虞", "万", "支", "柯", "管",
  "卢", "莫", "经", "房", "缪", "干", "解", "应", "宗", "丁",
  "宣", "邓", "郁", "单", "杭", "洪", "包", "诸", "左", "石",
  "崔", "吉", "龚", "程", "邢", "裴", "陆", "荣", "翁", "荀",
  "羊", "惠", "甄", "曲", "封", "储", "靳", "伏"
]);

/**
 * 从姓名中提取姓氏。优先匹配复姓（2 字），再匹配单姓（1 字）。
 * 未命中已知姓氏时返回 null，不做猜测。
 */
export function extractSurname(name: string): string | null {
  if (name.length >= 2) {
    const twoChar = name.slice(0, 2);
    if (CHINESE_SURNAME_LIST.has(twoChar)) return twoChar;
  }
  if (name.length >= 1) {
    const oneChar = name.slice(0, 1);
    if (CHINESE_SURNAME_LIST.has(oneChar)) return oneChar;
  }
  return null;
}

/**
 * 通用实体抽取规则。所有涉及实体识别的 prompt 共用此数组，杜绝多处 prompt 规则漂移。
 * 含 `{genericTitles}` 占位符，构建 prompt 时动态替换为当前有效泛称列表。
 */
export const ENTITY_EXTRACTION_RULES: readonly string[] = [
  "原文中的文字必须精确引用（surfaceForm/rawText），禁止编造或改写。",
  "优先匹配已知人物档案中的标准名(canonicalName)；仅确认全新人物时才创建新 personaName。",
  "泛化称谓（{genericTitles}）禁止作为独立人物名。单独姓氏无法确认具体人物时标记为 generic。",
  "仅提取虚构角色，排除作者、评注者、真实历史人物、批评家。",
  'personaName 使用规范人名，禁止附加"大人""老爷"等泛称后缀。',
  '已知别名须映射回标准名（如"范举人"→ 范进），不得重复创建。',
  "不确定时宁可忽略，避免误建幻觉人物。",
  "同一人物在同一片段中的多种称呼（姓名、官衔、别号）都应识别并映射到同一实体。"
];

/** 关系抽取规则。buildChapterAnalysisPrompt 等使用。 */
export const RELATIONSHIP_EXTRACTION_RULES: readonly string[] = [
  "description 写结论，evidence 填原文短句（≤120字）。",
  "不跨段推测，当前片段无证据则不输出该关系。",
  "ironyNote 仅在有直接讽刺/反语证据时填写。",
  "避免自关系（source 与 target 不得相同）。"
];

/**
 * 将规则数组格式化为编号列表，并替换占位符。
 * 用于 prompt 构建，保证所有 prompt 共用同一份规则文本。
 */
export function formatRulesSection(
  rules: readonly string[],
  replacements?: Record<string, string>,
  startIndex = 1
): string {
  return rules
    .map((rule, i) => {
      let text = rule;
      if (replacements) {
        for (const [key, value] of Object.entries(replacements)) {
          text = text.replaceAll(`{${key}}`, value);
        }
      }
      return `${startIndex + i}. ${text}`;
    })
    .join("\n");
}

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

/**
 * Prompt 中泛化称谓示例的截取数量上限。
 * 全局统一使用此常量，避免 ChapterAnalysisService 和 prompts.ts 各自硬编码导致口径漂移。
 */
export const GENERIC_TITLES_PROMPT_LIMIT = 30;
