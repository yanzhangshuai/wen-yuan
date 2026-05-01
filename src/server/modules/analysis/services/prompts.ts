/**
 * =============================================================================
 * 文件定位（分析服务：Prompt 类型契约与校验响应解析）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/analysis/services/prompts.ts`
 *
 * 模块职责：
 * - 维护 Prompt 输入类型契约，保证上游调用参数含义稳定；
 * - 提供构建 DB 模板 replacements 所需的 RulesText 辅助函数；
 * - 对模型返回的校验 JSON 做修复与结构化解析。
 *
 * 注意：
 * - Prompt 模板本身存储在数据库 `prompt_templates` + `prompt_template_versions` 中，
 *   通过 `resolvePromptTemplate()` 在运行时加载；
 * - 本文件不再包含硬编码的 prompt builder 函数。
 * =============================================================================
 */
import type { AnalysisProfileContext } from "@/types/analysis";
import {
  type ValidationIssue,
  type ValidationIssueType,
  type ValidationSeverity,
  type ValidationSuggestionAction
} from "@/types/validation";
import { repairJson } from "@/types/analysis";
import { formatRulesSection } from "@/server/modules/analysis/config/lexicon";

/**
 * 功能：定义生成分段 Prompt 所需参数。
 * 输入：无。
 * 输出：类型约束 BuildPromptInput。
 * 异常：无。
 * 副作用：无。
 */
export interface BuildPromptInput {
  /** 书名，用于限定语境与减少模型跨文本幻觉。 */
  bookTitle                   : string;
  /** 当前章节号（用于输出锚定与审计定位）。 */
  chapterNo                   : number;
  /** 当前章节标题（提高语义理解准确度）。 */
  chapterTitle                : string;
  /** 当前分段正文内容。 */
  content                     : string;
  /** 已建档人物上下文（帮助做实体对齐）。 */
  profiles                    : AnalysisProfileContext[];
  /** 当前分片序号（从 1 开始）。 */
  chunkIndex                  : number;
  /** 分片总数（用于引导模型避免跨片段臆断）。 */
  chunkCount                  : number;
  /** 可选覆盖的泛化称谓示例（测试或策略定制场景）。 */
  genericTitlesExample?       : string;
  /** 可选覆盖的实体抽取规则。 */
  entityExtractionRules?      : readonly string[];
  /** 可选覆盖的关系抽取规则。 */
  relationshipExtractionRules?: readonly string[];
  /** 当前启用的关系类型字典渲染文本。 */
  relationshipTypeDictionary? : string;
}

export interface RelationshipTypeDictionaryPromptEntry {
  code         : string;
  name         : string;
  group        : string;
  directionMode: string;
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
  bookTitle             : string;
  /** 章节号。 */
  chapterNo             : number;
  /** 章节标题。 */
  chapterTitle          : string;
  /** 完整章节正文（Phase 1 需要整章观察）。 */
  content               : string;
  /** 已建档人物列表，用于“已知/新建”判定。 */
  profiles              : AnalysisProfileContext[];
  /** 可选覆盖泛化称谓示例。 */
  genericTitlesExample? : string;
  /** 可选覆盖的实体抽取规则。 */
  entityExtractionRules?: readonly string[];
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

export function buildRosterDiscoveryRulesText(input: Pick<RosterDiscoveryInput, "genericTitlesExample" | "entityExtractionRules">): string {
  const genericTitlesExample = input.genericTitlesExample ?? "";
  const rosterSpecificRules: readonly string[] = [
    "尊号/帝号/封号：可对应已知人物→填entityId+isTitleOnly:true；新人物→isNew+isTitleOnly:true。",
    "别名/称号/职位类型额外标注: aliasType(TITLE|POSITION|KINSHIP|NICKNAME|COURTESY_NAME), contextHint(≤100字), suggestedRealName, aliasConfidence(0-1)。"
  ];
  const entityRules = input.entityExtractionRules ?? [];
  return formatRulesSection([...entityRules, ...rosterSpecificRules], { genericTitles: genericTitlesExample });
}

export function buildChapterAnalysisRulesText(input: Pick<BuildPromptInput, "genericTitlesExample" | "entityExtractionRules" | "relationshipExtractionRules">): string {
  const genericTitlesExample = input.genericTitlesExample ?? "";
  const analysisPreRules: readonly string[] = [
    "仅输出原始 JSON，禁止 markdown 代码块。",
    "relationships 只声明全书唯一的结构身份关系，字段使用 relationshipTypeCode，不写章节互动摘要。",
    "relationshipEvents 只写本章互动事件；每条事件必须能通过 sourceName + targetName + relationshipTypeCode 对应到 relationships 中一条。",
    "relationshipTypeCode 必须从已知关系类型字典中选择；未列出的关系不要自创，也不要输出。",
    "attitudeTags 每条最多 3 个；信号不足时输出 []。"
  ];
  const analysisPostRules: readonly string[] = [
    "biography.category 限定: BIRTH|EXAM|CAREER|TRAVEL|SOCIAL|DEATH|EVENT。",
    "rawText 必须精准截取原文；event 客观描述，禁止抒情。不跨段推测，缺失则返回[]。"
  ];
  const entityRules = input.entityExtractionRules ?? [];
  const relationshipRules = input.relationshipExtractionRules ?? [];
  return formatRulesSection([
    ...analysisPreRules,
    ...entityRules,
    ...analysisPostRules,
    ...relationshipRules
  ], { genericTitles: genericTitlesExample });
}

export function formatRelationshipTypeDictionary(
  entries: readonly RelationshipTypeDictionaryPromptEntry[]
): string {
  if (entries.length === 0) {
    return "（暂无启用关系类型；relationships 与 relationshipEvents 必须返回 []）";
  }

  const groupMap = new Map<string, RelationshipTypeDictionaryPromptEntry[]>();
  for (const entry of entries) {
    const group = entry.group.trim() || "未分组";
    const groupEntries = groupMap.get(group) ?? [];
    groupEntries.push(entry);
    groupMap.set(group, groupEntries);
  }

  const lines: string[] = [];
  for (const [group, groupEntries] of groupMap) {
    lines.push(`【${group}】`);
    for (const entry of groupEntries) {
      lines.push(`- ${entry.code} · ${entry.name} · ${entry.directionMode}`);
    }
  }

  return lines.join("\n");
}

export function buildIndependentExtractionRulesText(input: Pick<IndependentExtractionInput, "entityExtractionRules" | "genericTitlesExample">): string {
  const genericTitlesExample = input.genericTitlesExample ?? "";
  const baseRules = input.entityExtractionRules ?? [];
  const genericRule = genericTitlesExample
    ? `泛化称谓（如${genericTitlesExample}）如果在本章特指某一人物，则作为该人物的 alias；否则忽略。`
    : "泛化称谓如果在本章特指某一人物，则作为该人物的 alias；否则忽略。";
  return [
    "仅输出原始 JSON 数组，禁止 markdown 代码块。",
    ...baseRules,
    "name 填写人物最可能的完整姓名（如有名有姓优先用全名）。",
    "aliases 填写本章出现的其他称谓（官衔、字号、亲属称呼等），每个别名 ≤10 字。",
    genericRule,
    "同一人物在本章即使有多个称谓，也只输出一条记录，所有称谓放入 aliases。",
    "description 用一句话概括人物在本章的角色/行为，≤50字。",
    "category: PERSON=有名有姓的人物或有明确身份的角色；MENTIONED_ONLY=仅在对话或叙述中被提及但未直接出场。",
    "不要提取地名、物品名、组织名等非人物实体。",
    "name 和每个 alias 长度必须 ≤10 个中文字符，超过说明提取有误。"
  ].map((rule, index) => `${index + 1}. ${rule}`).join("\n");
}

/** * 功能：生成 Pass 1"独立章节实体提取"Prompt。
 * 不传入任何已有 profiles，让 LLM 纯粹从原文中提取人物。
 * 消除 entityId 数字编号选错导致的级联合并错误。
 */
export interface IndependentExtractionInput {
  /** 书名。 */
  bookTitle             : string;
  /** 章节号。 */
  chapterNo             : number;
  /** 章节标题。 */
  chapterTitle          : string;
  /** 章节正文。 */
  content               : string;
  /** 可选覆盖的实体抽取规则。 */
  entityExtractionRules?: readonly string[];
  /** 可选覆盖的泛称示例文本（来自 FullRuntimeKnowledge 的实际泛称示例）。 */
  genericTitlesExample? : string;
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
