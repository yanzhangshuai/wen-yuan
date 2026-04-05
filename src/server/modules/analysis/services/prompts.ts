/**
 * =============================================================================
 * 文件定位（分析服务：Prompt 构建与校验响应解析）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/services/prompts.ts`
 *
 * 模块职责：
 * - 为多个分析阶段构建统一 Prompt（名册发现、章节分析、称号溯源、质量校验等）；
 * - 维护 Prompt 输入类型契约，保证上游调用参数含义稳定；
 * - 对模型返回的校验 JSON 做修复与结构化解析。
 *
 * 在链路中的位置：
 * - 上游：章节分析服务、验证服务、aiClient；
 * - 下游：各 Provider 客户端（仅消费字符串 Prompt）与解析器。
 *
 * 关键业务约束：
 * - Prompt 文案中的规则属于业务规则，不是技术注释，改动会直接影响抽取准确率；
 * - 同一概念（如 generic titles 示例）必须统一口径，避免多处 prompt 漂移导致结果不一致。
 * =============================================================================
 */
import type { AnalysisProfileContext, TitleArbitrationEntry, TitleArbitrationInput, TitleResolutionEntry, TitleResolutionInput } from "@/types/analysis";
import type { PromptMessageInput } from "@/types/pipeline";
import {
  type ValidationIssue,
  type ValidationIssueType,
  type ValidationSeverity,
  type ValidationSuggestionAction
} from "@/types/validation";
import { repairJson } from "@/types/analysis";
import { buildEffectiveGenericTitles } from "@/server/modules/analysis/config/lexicon";

// 文档要求泛化称谓示例 >= 30；使用常量避免多个 prompt 构建点口径漂移。
const GENERIC_TITLES_PROMPT_LIMIT = 30;

/**
 * 从 GENERIC_TITLES 生成 prompt 使用的示例列表。
 * 这里固定从统一词库截取，避免章节分析/名册发现/测试断言三处列表不一致。
 */
const GENERIC_TITLES_EXAMPLE = Array.from(buildEffectiveGenericTitles(undefined)).slice(0, GENERIC_TITLES_PROMPT_LIMIT).join("、") + "等";

/**
 * 功能：定义生成分段 Prompt 所需参数。
 * 输入：无。
 * 输出：类型约束 BuildPromptInput。
 * 异常：无。
 * 副作用：无。
 */
export interface BuildPromptInput {
  /** 书名，用于限定语境与减少模型跨文本幻觉。 */
  bookTitle            : string;
  /** 当前章节号（用于输出锚定与审计定位）。 */
  chapterNo            : number;
  /** 当前章节标题（提高语义理解准确度）。 */
  chapterTitle         : string;
  /** 当前分段正文内容。 */
  content              : string;
  /** 已建档人物上下文（帮助做实体对齐）。 */
  profiles             : AnalysisProfileContext[];
  /** 当前分片序号（从 1 开始）。 */
  chunkIndex           : number;
  /** 分片总数（用于引导模型避免跨片段臆断）。 */
  chunkCount           : number;
  /** 可选覆盖的泛化称谓示例（测试或策略定制场景）。 */
  genericTitlesExample?: string;
}

/**
 * 功能：定义生成 Phase 1 人物名册发现 Prompt 所需参数。
 * 输入：无。
 * 输出：类型约束 RosterDiscoveryInput。
 * 异常：无。
 * 副作用：无。
 */
export interface RosterDiscoveryInput {
  /** 书名。 */
  bookTitle            : string;
  /** 章节号。 */
  chapterNo            : number;
  /** 章节标题。 */
  chapterTitle         : string;
  /** 完整章节正文（Phase 1 需要整章观察）。 */
  content              : string;
  /** 已建档人物列表，用于“已知/新建”判定。 */
  profiles             : AnalysisProfileContext[];
  /** 可选覆盖泛化称谓示例。 */
  genericTitlesExample?: string;
}

export interface ChapterValidationPromptInput {
  /** 书名。 */
  bookTitle       : string;
  /** 章节号。 */
  chapterNo       : number;
  /** 章节标题。 */
  chapterTitle    : string;
  /** 章节正文（用于回溯证据）。 */
  chapterContent  : string;
  /** 系统内当前已存在的人物候选。 */
  existingPersonas: Array<{
    /** 人物 ID。 */
    id        : string;
    /** 标准名。 */
    name      : string;
    /** 别名列表。 */
    aliases   : string[];
    /** 姓名类型（NAMED/TITLE_ONLY）。 */
    nameType  : string;
    /** 置信度。 */
    confidence: number;
  }>;
  /** 本轮新创建人物。 */
  newlyCreated: Array<{
    /** 人物 ID。 */
    id        : string;
    /** 标准名。 */
    name      : string;
    /** 姓名类型。 */
    nameType  : string;
    /** 置信度。 */
    confidence: number;
  }>;
  /** 本章原文提及片段。 */
  chapterMentions: Array<{
    /** 归一化后人物名。 */
    personaName: string;
    /** 原文命中片段。 */
    rawText    : string;
  }>;
  /** 本章关系抽取结果。 */
  chapterRelationships: Array<{
    /** 起点人物名。 */
    sourceName: string;
    /** 终点人物名。 */
    targetName: string;
    /** 关系类型。 */
    type      : string;
  }>;
}

export interface BookValidationPromptInput {
  /** 书名。 */
  bookTitle: string;
  /** 全书人物摘要。 */
  personas: Array<{
    /** 人物 ID。 */
    id          : string;
    /** 标准名。 */
    name        : string;
    /** 别名列表。 */
    aliases     : string[];
    /** 姓名类型。 */
    nameType    : string;
    /** 置信度。 */
    confidence  : number;
    /** 提及次数（用于判断是否疑似噪声人物）。 */
    mentionCount: number;
  }>;
  /** 全书关系聚合摘要。 */
  relationships: Array<{
    /** 起点人物名。 */
    sourceName: string;
    /** 终点人物名。 */
    targetName: string;
    /** 关系类型。 */
    type      : string;
    /** 同类关系命中次数。 */
    count     : number;
  }>;
  /** 低置信人物集合。 */
  lowConfidencePersonas: Array<{
    /** 人物 ID。 */
    id        : string;
    /** 人物名。 */
    name      : string;
    /** 置信度。 */
    confidence: number;
  }>;
  /** 引用原文片段，供模型做证据化校验。 */
  sourceExcerpts: Array<{
    /** 章节号。 */
    chapterNo   : number;
    /** 章节标题。 */
    chapterTitle: string;
    /** 该片段被选入的原因。 */
    reason      : string;
    /** 原文摘录。 */
    excerpt     : string;
  }>;
}

/**
 * 功能：将人物档案列表转为 Known Entities 短整型索引文本。
 * 格式：[N] 标准名 | 别名: xxx, yyy | 小传: ...
 * 输入：profiles - 人物档案列表。
 * 输出：多行字符串，每行对应一个人物。
 * 异常：无。
 * 副作用：无。
 */
function buildEntityContextLines(profiles: AnalysisProfileContext[]): string {
  return profiles
    .map((p, idx) => {
      const id = idx + 1;
      const uniqueAliases = p.aliases.filter((a) => a !== p.canonicalName);
      const aliasStr = uniqueAliases.length > 0 ? uniqueAliases.join(", ") : "（无）";
      const summaryStr = p.localSummary ? ` | 小传: ${p.localSummary}` : "";
      return `[${id}] ${p.canonicalName} | 别名: ${aliasStr}${summaryStr}`;
    })
    .join("\n");
}

/**
 * 功能：生成"章节人物名册发现"Phase 1 Prompt。
 * 输入：input - 书名、章节信息、完整正文与已知人物档案。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildRosterDiscoveryPrompt(input: RosterDiscoveryInput): PromptMessageInput {
  const entityContextLines =
    input.profiles.length > 0
      ? buildEntityContextLines(input.profiles)
      : "（本书目前尚无已建档人物）";

  const genericTitlesExample = input.genericTitlesExample ?? GENERIC_TITLES_EXAMPLE;
  const user = [
    "## 任务",
    `阅读《${input.bookTitle}》第 ${input.chapterNo} 章「${input.chapterTitle}」的完整正文。`,
    "建立**本章人物名册**：枚举本章原文中所有明确出现的人物称谓（姓名、官衔称呼、亲属称呼等）。",
    "",
    "## 已知人物档案（Known Entities）",
    entityContextLines,
    "",
    "## 输出规则",
    "1. 每个条目的 **surfaceForm** 必须是原文精确字符串，不得修改或翻译",
    "2. 若 surfaceForm 对应已知人物 → 填入该人物的档案序号（entityId，如 1、2、3）",
    '3. 若 surfaceForm 确认为本书**全新故事人物** → 填 "isNew": true',
    `4. 若 surfaceForm 是**泛化称谓**（如 ${genericTitlesExample}，无法唯一指向某人）→ 填 "generic": true`,
    "5. 相同称谓只输出**一次**（去重）",
    "6. **不要**凭想象补充原文中未出现的人物",
    "7. **只列举书中的叙事故事人物（虚构角色）**，严格排除以下类型：",
    "   - 本书作者（如吴敬梓）、整理者、评注者、推荐序作者（如惺园退士）",
    "   - 在序言、题跋、附录中出现的真实历史人物（非故事角色）",
    "   - 现代文学批评家、学者（如鲁迅等）",
    "8. 单独出现的姓氏（如\"顾\"、\"夏\"、\"荀\"等单字），若无法确认是独立人物，标记为 generic",
    "9. 若 surfaceForm 是尊号/帝号/王号/封号（如太祖皇帝、吴王、太后），且原文无法直接得知其真实姓名：若该称号可对应已知人物档案 → 填 entityId 并标记 \"isTitleOnly\": true；若确认为全新未知人物 → 填 \"isNew\": true 并标记 \"isTitleOnly\": true",
    "10. 若 surfaceForm 是别名/称号/封号/职位称呼类型，额外标注:",
    "    - \"aliasType\": \"TITLE\"(封号/尊号) | \"POSITION\"(职位称呼) | \"KINSHIP\"(亲属代称) | \"NICKNAME\"(绰号) | \"COURTESY_NAME\"(字号)",
    "    - \"contextHint\": 简述该称呼在本章上下文中的线索（≤100字），包括共现人物、相关事件",
    "    - \"suggestedRealName\": 如果上下文能推断出对应的真实人名，填写；否则省略",
    "    - \"aliasConfidence\": 对 suggestedRealName 的确信度（0-1）",
    "",
    "## 输出格式（仅输出 JSON 数组，不加任何说明或 Markdown 代码块）",
    JSON.stringify([
      { surfaceForm: "范举人", entityId: 1 },
      { surfaceForm: "范老爷", entityId: 1, aliasType: "NICKNAME" },
      { surfaceForm: "严监生", isNew: true },
      { surfaceForm: "太祖皇帝", isNew: true, isTitleOnly: true, aliasType: "TITLE", contextHint: "文中提及明朝开国，与朱元璋事迹吻合", suggestedRealName: "朱元璋", aliasConfidence: 0.9 },
      { surfaceForm: "那老者", generic: true }
    ], null, 2),
    "",
    "## 本章正文",
    input.content
  ].join("\n");

  return {
    system: "你是古典中文文献的命名实体专家，专注于从文言文中准确识别人物称谓。",
    user
  };
}

/**
 * 功能：生成"章节分段分析"高约束 Prompt。
 * 输入：input - 当前书籍、章节、分段内容与人物上下文。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildChapterAnalysisPrompt(input: BuildPromptInput): PromptMessageInput {
  // 实体上下文：使用短整型索引格式（[N] 标准名 | 别名 | 小传），让模型直接引用标准名
  const entityContext =
    input.profiles.length > 0
      ? buildEntityContextLines(input.profiles)
      : "（本书目前尚无已建档人物）";

  const genericTitlesExample = input.genericTitlesExample ?? GENERIC_TITLES_EXAMPLE;
  const user = [
    "## Task",
    `分析书籍《${input.bookTitle}》第${input.chapterNo}章/回（${input.chapterTitle}）的文本片段（第 ${input.chunkIndex + 1}/${input.chunkCount} 段）。`,
    "将非结构化叙事转换为结构化 JSON 数据，涵盖：生平/关键事件 (biographies)、实体提及 (mentions)、实体间动态关系 (relationships)。",
    "",
    "## Strict Rules",
    "1. OUTPUT: Return raw JSON only. Do not use markdown code blocks (` ` `json).",
    "2. ENTITY RESOLUTION: 必须优先匹配 [Known Entities]。若文中出现的称谓在已知档案的别名中，必须统一映射回该档案的标准名（canonicalName）。仅当确认为全新人物时才创建新 personaName。",
    "3. CATEGORY: biography.category 必须严格限制在 [BIRTH, EXAM, CAREER, TRAVEL, SOCIAL, DEATH, EVENT] 范围内。",
    "4. VERACITY: rawText 必须是原文的精准截取。event 描述需客观，避免主观抒情。",
    "5. FRAGMENTATION: 若当前片段不包含特定数据类型，对应数组返回 []。不要跨段推测。",
    "6. RELATION: relationship.description 只写结构化关系结论；relationship.evidence 单独填写原文证据短句（<=120字）。",
    "7. IRONY: ironyNote 为可选字段，仅在本段存在可直接引用的讽刺证据时填写；禁止泛化评价（如\"批判社会\"）。",
    "8. UNCERTAINTY: 不确定的人物或关系不要猜测，直接忽略。",
    `9. GENERIC TITLES: ${genericTitlesExample}无法唯一指向具体人物的泛化称谓，禁止作为独立 personaName 输出，直接忽略。`,
    "10. ALIAS MAPPING: 若原文使用官衔或亲属称谓指代已知人物（如\"范举人\"指代档案中的\"范进\"），personaName 必须填写该人物的标准名（canonicalName），而非原文称谓。",
    "11. VERBATIM NAME: personaName 必须为规范人名，不得在人名后附加\"大人\"\"老爷\"等称谓后缀。",
    "12. STORY CHARS ONLY: 只提取书中叙事故事人物（虚构角色）。严禁提取：作者（如吴敬梓）、评注者（如惺园退士）、序言里的真实历史人物、现代批评家（如鲁迅）、单独姓氏（如\"顾\"\"夏\"\"荀\"不可作为独立人物）。",
    "",
    "## Known Entities (Context)",
    entityContext,
    "",
    "## JSON Output Format",
    JSON.stringify({
      biographies: [
        {
          personaName: "实体标准名（对应 Known Entities 中的 canonicalName，或新人物名）",
          category   : "枚举值",
          event      : "简述发生的关键行为或状态变更",
          title      : "当时的头衔/身份/职业",
          location   : "发生的具体地理位置",
          virtualYear: "文中提到的时间点（如: 万历三十年, 2077年, 秋天）",
          ironyNote  : "仅填写本段可证据化的讽刺点；若无则省略"
        }
      ],
      mentions: [
        {
          personaName: "实体标准名",
          rawText    : "原文片段",
          summary    : "此段落中实体的状态描述",
          paraIndex  : 0
        }
      ],
      relationships: [
        {
          sourceName : "发起者标准名",
          targetName : "接收者标准名",
          type       : "关系类型（如: 师生, 敌对, 盟友, 家属）",
          weight     : 0.5,
          description: "结构化关系结论（不要复制原文）",
          evidence   : "支持该关系结论的原文短句"
        }
      ]
    }, null, 2),
    "",
    "## Source Text",
    input.content
  ].join("\n");

  return {
    system: "你是一个通用的叙事文学结构化提取专家，能够精准识别复杂文本中的实体轨迹与社交网络。",
    user
  };
}

/**
 * 功能：生成“称号人物真名溯源” Phase 5 Prompt。
 * 输入：input - 书名与待溯源称号列表。
 * 输出：可直接发送给模型的字符串 Prompt。
 * 异常：无。
 * 副作用：无。
 */
export function buildTitleResolutionPrompt(input: TitleResolutionInput): PromptMessageInput {
  const tableRows = input.entries.map(
    (e) => `| ${e.title} | ${e.localSummary ?? ""} |`
  ).join("\n");

  const exampleOutput: Omit<TitleResolutionEntry, "personaId">[] = [
    { title: "太祖皇帝", realName: "朱元璋", confidence: 0.95, historicalNote: "明朝开国皇帝，庙号太祖" },
    { title: "吴王",   realName: "朱元璋", confidence: 0.90, historicalNote: "封吴王时期尚未称帝" },
    { title: "不知名称号", realName: null, confidence: 0.2, historicalNote: "无历史依据" }
  ];

  const user = [
    "## 任务",
    `书名：《${input.bookTitle}》`,
    "以下人物在书中仅以称号出现，请根据书中语境和历史知识，推断其真实姓名。",
    "",
    "## 称号列表",
    "| 称号 | 书中摘要 |",
    "|------|----------|",
    tableRows,
    "",
    "## 输出规则",
    "1. realName 填写最准确的历史真名（如\"朱元璋\"）",
    "2. 若确实无法判断→ realName 填 null",
    "3. confidence 0.0-1.0：有据可查填 0.85+，较有把握的推断填 0.7-0.85，一般推断填 0.5-0.7，不确定填 < 0.5",
    "4. historicalNote 简短说明推理依据（≤ 30字）",
    "5. 每个称号必须对应一条输出，不得多个称号共用同一条",
    "",
    "## 输出格式（仅输出 JSON 数组，不加任何说明或 Markdown 代码块）",
    JSON.stringify(exampleOutput, null, 2)
  ].join("\n");

  return {
    system: "你是中国古典文学历史背景专家，熟悉明清小说历史原型。",
    user
  };
}

export function buildTitleArbitrationPrompt(input: TitleArbitrationInput): PromptMessageInput {
  const terms = input.terms.map((item) =>
    `- "${item.surfaceForm}" (chapterAppearanceCount=${item.chapterAppearanceCount}, hasStableAliasBinding=${item.hasStableAliasBinding}, singlePersonaConsistency=${item.singlePersonaConsistency}, genericRatio=${item.genericRatio.toFixed(2)})`
  ).join("\n");

  const example: TitleArbitrationEntry[] = [
    { surfaceForm: "掌门", isPersonalized: true, confidence: 0.82, reason: "多章稳定指向同一人物" },
    { surfaceForm: "先生", isPersonalized: false, confidence: 0.74, reason: "多次泛指，缺乏稳定绑定" }
  ];

  const user = [
    "## 任务",
    `判断《${input.bookTitle}》中的灰区称谓是否已经人格化为特定人物稳定称呼。`,
    "",
    "## 约束",
    "1. 只针对给定称谓逐项判断，不扩展新增词。",
    "2. 若称谓明显泛指，isPersonalized 返回 false。",
    "3. confidence 只反映当前判断确信度。",
    "",
    "## 待判定称谓",
    terms || "（无）",
    "",
    "## 输出格式（仅输出 JSON 数组，不加任何说明）",
    JSON.stringify(example, null, 2)
  ].join("\n");

  return {
    system: "你是文学实体解析仲裁助手。",
    user
  };
}

const VALIDATION_ISSUE_TYPES: readonly ValidationIssueType[] = [
  "ALIAS_AS_NEW_PERSONA",
  "WRONG_MERGE",
  "MISSING_NAME_MAPPING",
  "INVALID_RELATIONSHIP",
  "SAME_NAME_DIFFERENT_PERSON",
  "DUPLICATE_PERSONA",
  "LOW_CONFIDENCE_ENTITY",
  "ORPHAN_MENTION"
];

const VALIDATION_SEVERITIES: readonly ValidationSeverity[] = [
  "ERROR",
  "WARNING",
  "INFO"
];

const VALIDATION_ACTIONS: readonly ValidationSuggestionAction[] = [
  "MERGE",
  "SPLIT",
  "UPDATE_NAME",
  "ADD_ALIAS",
  "DELETE",
  "ADD_MAPPING",
  "MANUAL_REVIEW"
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function normalizeValidationIssueType(value: unknown): ValidationIssueType | undefined {
  return typeof value === "string" && (VALIDATION_ISSUE_TYPES as readonly string[]).includes(value)
    ? value as ValidationIssueType
    : undefined;
}

function normalizeValidationSeverity(value: unknown): ValidationSeverity | undefined {
  return typeof value === "string" && (VALIDATION_SEVERITIES as readonly string[]).includes(value)
    ? value as ValidationSeverity
    : undefined;
}

function normalizeValidationAction(value: unknown): ValidationSuggestionAction | undefined {
  return typeof value === "string" && (VALIDATION_ACTIONS as readonly string[]).includes(value)
    ? value as ValidationSuggestionAction
    : undefined;
}

function normalizeConfidence(value: unknown): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return 0;
  }

  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function buildChapterValidationPrompt(input: ChapterValidationPromptInput): PromptMessageInput {
  const user = [
    "## 核心原则",
    "1. 保守判断：只报告你确信存在的问题，不确定时宁可不报",
    "2. 证据导向：每个问题必须附带原文证据或数据矛盾点",
    "3. 不要过度修正：不要仅因为“可能”就建议合并或拆分",
    "4. 不要发明信息：不要推测原文中没有的信息",
    "",
    "## 检查维度",
    "1. 别名误识别：检查新建人物是否实际上是已知人物的别名/称号",
    "2. 错误合并：检查是否有不同人物被错误归到同一 persona",
    "3. 漏掉映射：检查 TITLE_ONLY 人物是否有线索可确定真名",
    "4. 关系合理性：检查关系是否自洽（无自我关系、无明显矛盾）",
    "5. 同名异人：检查同名人物在不同上下文中是否表现一致",
    "",
    "## 书籍上下文",
    `书名: 《${input.bookTitle}》`,
    `章节: 第${input.chapterNo}回「${input.chapterTitle}」`,
    "",
    "## 已知人物档案",
    ...input.existingPersonas.map((p) =>
      `- ${p.name} (${p.nameType}, 置信度:${p.confidence}) 别名:[${p.aliases.join(",")}]`
    ),
    "",
    "## 本章新建人物",
    ...input.newlyCreated.map((p) =>
      `- ${p.name} (${p.nameType}, 置信度:${p.confidence})`
    ),
    "",
    "## 本章提及记录",
    ...input.chapterMentions.slice(0, 50).map((m) =>
      `- ${m.personaName}: "${m.rawText.slice(0, 80)}"`
    ),
    "",
    "## 本章关系记录",
    ...input.chapterRelationships.map((r) =>
      `- ${r.sourceName} → ${r.targetName}: ${r.type}`
    ),
    "",
    "## 原文片段（重点段落）",
    input.chapterContent.slice(0, 3000),
    "",
    "## 输出格式（仅输出 JSON，不加任何说明或 Markdown 代码块）",
    JSON.stringify({
      issues: [
        {
          type              : "ALIAS_AS_NEW_PERSONA | WRONG_MERGE | MISSING_NAME_MAPPING | INVALID_RELATIONSHIP | SAME_NAME_DIFFERENT_PERSON | DUPLICATE_PERSONA",
          severity          : "ERROR | WARNING | INFO",
          confidence        : 0.85,
          description       : "问题的具体描述",
          evidence          : "原文证据或数据矛盾点",
          affectedPersonaIds: ["persona-id-1"],
          suggestion        : {
            action         : "MERGE | SPLIT | UPDATE_NAME | ADD_ALIAS | DELETE | ADD_MAPPING | MANUAL_REVIEW",
            targetPersonaId: "target-id (如适用)",
            sourcePersonaId: "source-id (如适用)",
            newName        : "建议的新名称 (如适用)",
            newAlias       : "建议添加的别名 (如适用)",
            reason         : "修正理由"
          }
        }
      ]
    }, null, 2),
    "",
    "## 重要提醒",
    "- 如果检查结果没有发现任何问题，返回 {\"issues\": []}",
    "- confidence < 0.6 的问题不要报告",
    "- 每个问题的 evidence 必须来自原文或上述数据，不可编造"
  ].join("\n");

  return {
    system: "你是一个文学文本实体解析的质量审核专家。你的任务是检查人物解析结果的准确性，发现并报告问题。",
    user
  };
}

export function buildBookValidationPrompt(input: BookValidationPromptInput): PromptMessageInput {
  const user = [
    "## 任务",
    `检查《${input.bookTitle}》全书人物解析结果的一致性与自洽性。`,
    "",
    "## 检查重点",
    "1. 全书人物列表一致性（同人多名、同名异人、重复 persona）",
    "2. 别名覆盖率（称号是否应回填到真实姓名）",
    "3. 关系图自洽性（矛盾关系、自我关系）",
    "4. 低置信实体是否需要人工审核",
    "",
    "## 全书人物列表",
    ...input.personas.map((p) =>
      `- ${p.name} [${p.id}] (${p.nameType}, 置信度:${p.confidence}, 提及:${p.mentionCount}) 别名:[${p.aliases.join(",")}]`
    ),
    "",
    "## 关系统计",
    ...input.relationships.map((r) =>
      `- ${r.sourceName} → ${r.targetName}: ${r.type} (出现 ${r.count} 次)`
    ),
    "",
    "## 低置信人物",
    ...input.lowConfidencePersonas.map((p) =>
      `- ${p.name} [${p.id}] (置信度:${p.confidence})`
    ),
    "",
    "## 抽样原文证据",
    ...input.sourceExcerpts.map((item) =>
      `- 第${item.chapterNo}章「${item.chapterTitle}」(${item.reason})：${item.excerpt}`
    ),
    "",
    "## 输出格式（仅输出 JSON，不加任何说明）",
    JSON.stringify({
      issues: [
        {
          type              : "DUPLICATE_PERSONA",
          severity          : "WARNING",
          confidence        : 0.9,
          description       : "同一人物可能存在重复记录",
          evidence          : "全书别名与关系指向高度重叠",
          affectedPersonaIds: ["persona-id-1", "persona-id-2"],
          suggestion        : {
            action         : "MERGE",
            targetPersonaId: "persona-id-1",
            sourcePersonaId: "persona-id-2",
            reason         : "建议合并重复实体"
          }
        }
      ]
    }, null, 2),
    "",
    "## 重要提醒",
    "- 若无问题返回 {\"issues\": []}",
    "- confidence < 0.6 的问题不要输出",
    "- 只输出有明确证据的问题"
  ].join("\n");

  return {
    system: "你是文学实体识别全书质检专家，需要做跨章节一致性检查。",
    user
  };
}

export function parseValidationResponse(raw: string): ValidationIssue[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(repairJson(raw));
  } catch (parseError) {
    console.warn("[parseValidationResponse] JSON parse failed:", String(parseError).slice(0, 200), "raw:", raw.slice(0, 200));
    return [];
  }

  const issuesRaw: unknown[] = Array.isArray(parsed)
    ? parsed
    : isRecord(parsed) && Array.isArray(parsed.issues)
      ? parsed.issues
      : [];

  const issues: ValidationIssue[] = [];
  for (let index = 0; index < issuesRaw.length; index += 1) {
    const item: unknown = issuesRaw[index];
    if (!isRecord(item)) {
      continue;
    }

    const type = normalizeValidationIssueType(item.type);
    const severity = normalizeValidationSeverity(item.severity);
    const description = asString(item.description);
    const evidence = asString(item.evidence);

    if (!type || !severity || !description || !evidence) {
      continue;
    }

    const suggestion = isRecord(item.suggestion) ? item.suggestion : null;
    const action = suggestion ? normalizeValidationAction(suggestion.action) : undefined;
    const reason = suggestion ? asString(suggestion.reason) : undefined;
    if (!action || !reason) {
      continue;
    }

    const affectedPersonaIds = Array.isArray(item.affectedPersonaIds)
      ? item.affectedPersonaIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : [];

    const affectedChapterIds = Array.isArray(item.affectedChapterIds)
      ? item.affectedChapterIds.filter((id): id is string => typeof id === "string" && id.trim().length > 0)
      : undefined;

    issues.push({
      id        : asString(item.id) ?? `issue-${index + 1}`,
      type,
      severity,
      confidence: normalizeConfidence(item.confidence),
      description,
      evidence,
      affectedPersonaIds,
      affectedChapterIds,
      suggestion: {
        action,
        targetPersonaId: suggestion ? asString(suggestion.targetPersonaId) : undefined,
        sourcePersonaId: suggestion ? asString(suggestion.sourcePersonaId) : undefined,
        newName        : suggestion ? asString(suggestion.newName) : undefined,
        newAlias       : suggestion ? asString(suggestion.newAlias) : undefined,
        reason
      }
    });
  }

  return issues;
}
