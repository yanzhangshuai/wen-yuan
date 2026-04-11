export type PromptTemplateSlug =
  | "INDEPENDENT_EXTRACTION"
  | "ENTITY_RESOLUTION"
  | "TITLE_RESOLUTION"
  | "TITLE_ARBITRATION"
  | "CHAPTER_ANALYSIS"
  | "ROSTER_DISCOVERY"
  | "CHAPTER_VALIDATION"
  | "BOOK_VALIDATION";

export interface PromptTemplatePlaceholderSpec {
  key        : string;
  label      : string;
  description: string;
  example    : string;
}

export interface PromptTemplateMetadataItem {
  slug        : PromptTemplateSlug;
  name        : string;
  description : string;
  codeRef     : string;
  placeholders: PromptTemplatePlaceholderSpec[];
  sampleInput : Record<string, string>;
}

const SAMPLE_KNOWN_ENTITIES = [
  "[1] 范进|范举人,范老爷",
  "[2] 胡屠户|胡老爹",
  "[3] 张乡绅|张老爷"
].join("\n");

const SAMPLE_ANALYSIS_RULES = [
  "1. 仅输出原始 JSON，禁止 markdown 代码块。",
  "2. 原文中的文字必须精确引用（surfaceForm/rawText），禁止编造或改写。",
  "3. 优先匹配已知人物档案中的标准名(canonicalName)。",
  "4. 泛化称谓（如老爷、夫人、先生等）禁止作为独立人物名。",
  "5. biography.category 限定: BIRTH|EXAM|CAREER|TRAVEL|SOCIAL|DEATH|EVENT。"
].join("\n");

const SAMPLE_ROSTER_RULES = [
  "1. 原文中的文字必须精确引用（surfaceForm/rawText），禁止编造或改写。",
  "2. 优先匹配已知人物档案中的标准名(canonicalName)。",
  "3. 泛化称谓（如老爷、夫人、先生等）禁止作为独立人物名。",
  "4. 尊号/帝号/封号：可对应已知人物→填entityId+isTitleOnly:true；新人物→isNew+isTitleOnly:true。",
  "5. 别名/称号/职位类型额外标注: aliasType(TITLE|POSITION|KINSHIP|NICKNAME|COURTESY_NAME), contextHint(≤100字), suggestedRealName, aliasConfidence(0-1)。"
].join("\n");

const SAMPLE_INDEPENDENT_RULES = [
  "1. 仅输出原始 JSON 数组，禁止 markdown 代码块。",
  "2. 原文中的文字必须精确引用（surfaceForm/rawText），禁止编造或改写。",
  "3. 泛化称谓（如老爷、夫人、先生等）如果在本章特指某一人物，则作为该人物的 alias；否则忽略。",
  "4. 同一人物在本章即使有多个称谓，也只输出一条记录，所有称谓放入 aliases。",
  "5. 不要提取地名、物品名、组织名等非人物实体。"
].join("\n");

const SAMPLE_CANDIDATE_GROUPS = [
  "### 候选组 1",
  "  - \"范进\"（落魄书生）出现于第3、4回",
  "  - \"范举人\"（中举后被乡里尊称）出现于第3、4回",
  "",
  "### 候选组 2",
  "  - \"娄三公子\"（娄家三子）出现于第5回",
  "  - \"娄四公子\"（娄家四子）出现于第5回"
].join("\n");

const SAMPLE_TITLE_ROWS = [
  "| 太祖皇帝 | 明朝开国皇帝，书中多次被追述 |",
  "| 吴王 | 称帝前的封号，与明初建国线索相关 |"
].join("\n");

const SAMPLE_TERMS = [
  "- \"掌门\" (chapterAppearanceCount=6, hasStableAliasBinding=true, singlePersonaConsistency=true, genericRatio=0.18)",
  "- \"先生\" (chapterAppearanceCount=11, hasStableAliasBinding=false, singlePersonaConsistency=false, genericRatio=0.78)"
].join("\n");

const SAMPLE_EXISTING_PERSONAS = [
  "- 范进 (PERSON, 置信度:0.96) 别名:[范举人,范老爷]",
  "- 胡屠户 (PERSON, 置信度:0.91) 别名:[胡老爹]"
].join("\n");

const SAMPLE_NEW_PERSONAS = [
  "- 张静斋 (PERSON, 置信度:0.83)",
  "- 周进 (MENTIONED_ONLY, 置信度:0.71)"
].join("\n");

const SAMPLE_CHAPTER_MENTIONS = [
  "- 范进: \"范进道：晚生久仰老先生。\"",
  "- 胡屠户: \"胡屠户骂道：这个现世宝穷鬼！\""
].join("\n");

const SAMPLE_CHAPTER_RELATIONSHIPS = [
  "- 范进 → 胡屠户: 岳父-女婿",
  "- 张乡绅 → 范进: 乡绅资助"
].join("\n");

const SAMPLE_PERSONAS = [
  "- 范进 [p1] (PERSON, 置信度:0.96, 提及:42) 别名:[范举人,范老爷]",
  "- 胡屠户 [p2] (PERSON, 置信度:0.91, 提及:18) 别名:[胡老爹]"
].join("\n");

const SAMPLE_RELATIONSHIPS = [
  "- 范进 → 胡屠户: 岳父-女婿 (出现 4 次)",
  "- 张乡绅 → 范进: 提携 (出现 2 次)"
].join("\n");

const SAMPLE_LOW_CONFIDENCE_PERSONAS = [
  "- 周进 [p9] (置信度:0.58)",
  "- 王太医 [p13] (置信度:0.61)"
].join("\n");

const SAMPLE_SOURCE_EXCERPTS = [
  "- 第3章「周学道校士拔真才」(代表性样本)：范进听了，昏绝于地。",
  "- 第4章「荐亡斋和尚吃官司」(覆盖更多章节)：张乡绅送银相助。"
].join("\n");

export const PROMPT_TEMPLATE_METADATA: Record<PromptTemplateSlug, PromptTemplateMetadataItem> = {
  INDEPENDENT_EXTRACTION: {
    slug        : "INDEPENDENT_EXTRACTION",
    name        : "Pass 1 独立提取",
    description : "对单章原文做独立人物提取，不依赖既有人物档案。",
    codeRef     : "buildIndependentExtractionPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "儒林外史" },
      { key: "chapterNo", label: "章节号", description: "当前章节序号。", example: "3" },
      { key: "chapterTitle", label: "章节标题", description: "当前章节标题。", example: "范进中举" },
      { key: "independentRules", label: "提取规则", description: "运行时合成的独立提取规则列表，包含实体规则与泛化称谓约束。", example: SAMPLE_INDEPENDENT_RULES },
      { key: "content", label: "章节原文", description: "当前整章正文。", example: "范进进了学，众人来贺......" }
    ],
    sampleInput: {
      bookTitle       : "儒林外史",
      chapterNo       : "3",
      chapterTitle    : "范进中举",
      independentRules: SAMPLE_INDEPENDENT_RULES,
      content         : "范进道：‘晚生今日侥幸中了。’胡屠户听罢，半晌说不出话来。"
    }
  },
  ENTITY_RESOLUTION: {
    slug        : "ENTITY_RESOLUTION",
    name        : "Pass 2 实体消歧",
    description : "对全书候选人物组做同人消歧与合并判断。",
    codeRef     : "buildEntityResolutionPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "儒林外史" },
      { key: "candidateGroups", label: "候选组", description: "待消歧的人物候选组正文。", example: SAMPLE_CANDIDATE_GROUPS },
      { key: "groups", label: "候选组兼容别名", description: "与 candidateGroups 等价，用于兼容旧模板。", example: SAMPLE_CANDIDATE_GROUPS }
    ],
    sampleInput: {
      bookTitle      : "儒林外史",
      candidateGroups: SAMPLE_CANDIDATE_GROUPS,
      groups         : SAMPLE_CANDIDATE_GROUPS
    }
  },
  TITLE_RESOLUTION: {
    slug        : "TITLE_RESOLUTION",
    name        : "称号溯源",
    description : "将仅以称号出现的人物溯源为真实姓名。",
    codeRef     : "buildTitleResolutionPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "明史演义" },
      { key: "titleEntries", label: "称号列表", description: "待溯源称号的 markdown 表格行。", example: SAMPLE_TITLE_ROWS }
    ],
    sampleInput: {
      bookTitle   : "明史演义",
      titleEntries: SAMPLE_TITLE_ROWS
    }
  },
  TITLE_ARBITRATION: {
    slug        : "TITLE_ARBITRATION",
    name        : "称号灰区仲裁",
    description : "对灰区称谓做是否已人格化的最终仲裁。",
    codeRef     : "buildTitleArbitrationPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "笑傲江湖" },
      { key: "terms", label: "灰区称谓列表", description: "待仲裁称谓与统计证据列表。", example: SAMPLE_TERMS }
    ],
    sampleInput: {
      bookTitle: "笑傲江湖",
      terms    : SAMPLE_TERMS
    }
  },
  CHAPTER_ANALYSIS: {
    slug        : "CHAPTER_ANALYSIS",
    name        : "Pass 3 章节分析",
    description : "对章节分片提取 biographies、mentions 与 relationships。",
    codeRef     : "buildChapterAnalysisPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "儒林外史" },
      { key: "chapterNo", label: "章节号", description: "当前章节序号。", example: "3" },
      { key: "chapterTitle", label: "章节标题", description: "当前章节标题。", example: "范进中举" },
      { key: "chunkIndex", label: "分片序号", description: "当前分片序号（从 1 开始）。", example: "1" },
      { key: "chunkCount", label: "分片总数", description: "当前章节分片总数。", example: "3" },
      { key: "analysisRules", label: "分析规则", description: "运行时合成的章节分析规则列表，包含实体与关系规则。", example: SAMPLE_ANALYSIS_RULES },
      { key: "knownEntities", label: "已知人物档案", description: "缩略的人物上下文列表。", example: SAMPLE_KNOWN_ENTITIES },
      { key: "content", label: "分片原文", description: "当前分片原文。", example: "范进回到家中，母亲欢喜不尽......" }
    ],
    sampleInput: {
      bookTitle    : "儒林外史",
      chapterNo    : "3",
      chapterTitle : "范进中举",
      chunkIndex   : "1",
      chunkCount   : "3",
      analysisRules: SAMPLE_ANALYSIS_RULES,
      knownEntities: SAMPLE_KNOWN_ENTITIES,
      content      : "范进回到家中，母亲欢喜不尽，张乡绅亦遣人前来相贺。"
    }
  },
  ROSTER_DISCOVERY: {
    slug        : "ROSTER_DISCOVERY",
    name        : "人物名册发现",
    description : "对整章人物称谓做枚举与预归一，兼容旧链路与无外部映射场景。",
    codeRef     : "buildRosterDiscoveryPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "儒林外史" },
      { key: "chapterNo", label: "章节号", description: "当前章节序号。", example: "3" },
      { key: "chapterTitle", label: "章节标题", description: "当前章节标题。", example: "范进中举" },
      { key: "knownEntities", label: "已知人物档案", description: "当前书籍已建档人物缩略上下文。", example: SAMPLE_KNOWN_ENTITIES },
      { key: "rosterRules", label: "名册规则", description: "运行时合成的人物名册发现规则列表。", example: SAMPLE_ROSTER_RULES },
      { key: "content", label: "章节原文", description: "当前整章正文。", example: "周学道按院，范进与众生员齐集。" },
      { key: "genericTitles", label: "泛化称谓兼容别名", description: "兼容旧模板的泛化称谓示例文本。", example: "老爷、夫人、先生等" }
    ],
    sampleInput: {
      bookTitle    : "儒林外史",
      chapterNo    : "3",
      chapterTitle : "周学道校士拔真才",
      knownEntities: SAMPLE_KNOWN_ENTITIES,
      rosterRules  : SAMPLE_ROSTER_RULES,
      content      : "周学道校士，众生员齐集，范进在其中战战兢兢。",
      genericTitles: "老爷、夫人、先生等"
    }
  },
  CHAPTER_VALIDATION: {
    slug        : "CHAPTER_VALIDATION",
    name        : "章节质量校验",
    description : "对单章解析结果做保守式质量审核。",
    codeRef     : "buildChapterValidationPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "儒林外史" },
      { key: "chapterNo", label: "章节号", description: "当前章节序号。", example: "3" },
      { key: "chapterTitle", label: "章节标题", description: "当前章节标题。", example: "范进中举" },
      { key: "existingPersonas", label: "已知人物档案", description: "当前已有的人物档案缩略列表。", example: SAMPLE_EXISTING_PERSONAS },
      { key: "newlyCreated", label: "本章新建人物", description: "本章新建人物列表。", example: SAMPLE_NEW_PERSONAS },
      { key: "chapterMentions", label: "本章提及记录", description: "本章 mention 摘要。", example: SAMPLE_CHAPTER_MENTIONS },
      { key: "chapterRelationships", label: "本章关系记录", description: "本章 relationship 摘要。", example: SAMPLE_CHAPTER_RELATIONSHIPS },
      { key: "chapterContent", label: "章节证据原文", description: "用于校验的章节证据片段。", example: "胡屠户骂罢，又见范进发疯，慌忙来救。" }
    ],
    sampleInput: {
      bookTitle           : "儒林外史",
      chapterNo           : "3",
      chapterTitle        : "范进中举",
      existingPersonas    : SAMPLE_EXISTING_PERSONAS,
      newlyCreated        : SAMPLE_NEW_PERSONAS,
      chapterMentions     : SAMPLE_CHAPTER_MENTIONS,
      chapterRelationships: SAMPLE_CHAPTER_RELATIONSHIPS,
      chapterContent      : "胡屠户骂罢，又见范进发疯，慌忙来救。"
    }
  },
  BOOK_VALIDATION: {
    slug        : "BOOK_VALIDATION",
    name        : "全书质量校验",
    description : "对全书人物与关系结果做跨章节一致性检查。",
    codeRef     : "buildBookValidationPrompt",
    placeholders: [
      { key: "bookTitle", label: "书名", description: "当前解析书籍名称。", example: "儒林外史" },
      { key: "personas", label: "全书人物列表", description: "全书人物摘要。", example: SAMPLE_PERSONAS },
      { key: "relationships", label: "关系统计", description: "全书关系聚合摘要。", example: SAMPLE_RELATIONSHIPS },
      { key: "lowConfidencePersonas", label: "低置信人物", description: "需要重点复核的低置信人物。", example: SAMPLE_LOW_CONFIDENCE_PERSONAS },
      { key: "sourceExcerpts", label: "抽样原文证据", description: "跨章节抽样原文证据。", example: SAMPLE_SOURCE_EXCERPTS }
    ],
    sampleInput: {
      bookTitle            : "儒林外史",
      personas             : SAMPLE_PERSONAS,
      relationships        : SAMPLE_RELATIONSHIPS,
      lowConfidencePersonas: SAMPLE_LOW_CONFIDENCE_PERSONAS,
      sourceExcerpts       : SAMPLE_SOURCE_EXCERPTS
    }
  }
};

export const PROMPT_TEMPLATE_ORDER: PromptTemplateSlug[] = [
  "INDEPENDENT_EXTRACTION",
  "ENTITY_RESOLUTION",
  "TITLE_RESOLUTION",
  "TITLE_ARBITRATION",
  "CHAPTER_ANALYSIS",
  "ROSTER_DISCOVERY",
  "CHAPTER_VALIDATION",
  "BOOK_VALIDATION"
];

export function getPromptTemplateMetadata(slug: string): PromptTemplateMetadataItem | null {
  return PROMPT_TEMPLATE_METADATA[slug as PromptTemplateSlug] ?? null;
}
