/**
 * 功能：定义 biography_records.category 允许值（与 Prisma BioCategory 枚举一致）。
 * 输入：无。
 * 输出：只读字符串字面量数组。
 * 异常：无。
 * 副作用：无。
 */
export const BIO_CATEGORY_VALUES = [
  "BIRTH",
  "EXAM",
  "CAREER",
  "TRAVEL",
  "SOCIAL",
  "DEATH",
  "EVENT"
] as const;

/**
 * 功能：从 BIO_CATEGORY_VALUES 推导生平事件类型联合值。
 * 输入：无。
 * 输出：类型约束 BioCategoryValue。
 * 异常：无。
 * 副作用：无。
 */
export type BioCategoryValue = (typeof BIO_CATEGORY_VALUES)[number];

/**
 * 功能：定义传给 AI 的人物上下文结构（来自 profiles + personas）。
 * 输入：无。
 * 输出：类型约束 AnalysisProfileContext。
 * 异常：无。
 * 副作用：无。
 */
export interface AnalysisProfileContext {
  /**
   * 功能：唯一标识符，便于模型区分不同人物（尤其是同名时）。
   * 输入：无。
   * 输出：字符串 ID。
   * 异常：无。
   * 副作用：无。
   */
  personaId    : string;
  canonicalName: string;
  aliases      : string[];
  localSummary?: string | null;
}

/**
 * 功能：定义 AI 提取到的原文提及结构。
 * 输入：无。
 * 输出：类型约束 AiMention。
 * 异常：无。
 * 副作用：无。
 */
export interface AiMention {
  personaName: string;
  rawText    : string;
  summary?   : string;
  paraIndex? : number;
}

/**
 * 功能：定义 AI 提取到的生平轨迹事件结构。
 * 输入：无。
 * 输出：类型约束 AiBiographyRecord。
 * 异常：无。
 * 副作用：无。
 */
export interface AiBiographyRecord {
  personaName : string;
  category    : BioCategoryValue;
  event       : string;
  title?      : string;
  location?   : string;
  virtualYear?: string;
  ironyNote?  : string;
}

/**
 * 功能：定义 AI 提取到的人物关系结构。
 * 输入：无。
 * 输出：类型约束 AiRelationship。
 * 异常：无。
 * 副作用：无。
 */
export interface AiRelationship {
  sourceName  : string;
  targetName  : string;
  type        : string;
  weight?     : number;
  description?: string;
  evidence?   : string;
}

/**
 * 功能：定义 AI 章节分析标准输出结构。
 * 输入：无。
 * 输出：类型约束 ChapterAnalysisResponse。
 * 异常：无。
 * 副作用：无。
 */
export interface ChapterAnalysisResponse {
  biographies  : AiBiographyRecord[];
  mentions     : AiMention[];
  relationships: AiRelationship[];
}

export const ALIAS_TYPE_VALUES = [
  "TITLE",
  "POSITION",
  "KINSHIP",
  "NICKNAME",
  "COURTESY_NAME"
] as const;

export type AliasTypeValue = (typeof ALIAS_TYPE_VALUES)[number];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 功能：尝试修复被 AI token 上限截断的不完整 JSON 字符串。
 * 策略：
 *   1. 尽剔 Markdown 代码块包裹；
 *   2. 尝试直接解析；
 *   3. 基于栈扫描找到最后一个「安全位置」（最近一次括号闭合处），截断后关闭所有未闭层级；
 *   4. 舍弃已写入的不完整内容，返回最小合法骨架。
 * 输入：raw - AI 返回的原始文本。
 * 输出：合法 JSON 字符串（始终可解析）。
 * 异常：无（容错设计）。
 * 副作用：无。
 */
export function repairJson(raw: string): string {
  // Step 1: 尿 Markdown 代码块包裹
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Step 2: 尝试直接解析
  try {
    JSON.parse(s);
    return s;
  } catch {
    /* fall through to repair */
  }

  // Step 3: 基于栈扫描，记录最后一个安全截断位置
  const stack: string[] = [];
  let inStr = false;
  let esc   = false;
  let lastSafeEnd = 0;

  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (esc)                 { esc = false; continue; }
    if (c === "\\" && inStr) { esc = true;  continue; }
    if (c === "\"")          { inStr = !inStr; continue; }
    if (inStr)               continue;

    if (c === "[" || c === "{") {
      stack.push(c);
    } else if (c === "]" || c === "}") {
      if (stack.length > 0) stack.pop();
      lastSafeEnd = i + 1; // 此层已完整关闭
    }
  }

  // Step 4: 截到最后安全位置，脱去末尾逗号，补齐陷层括号
  const root = s[0];
  if (lastSafeEnd === 0) {
    return root === "[" ? "[]" : "{}";
  }

  let candidate = s.slice(0, lastSafeEnd).trimEnd().replace(/,\s*$/, "");
  const tail = [...stack].reverse().map(c => c === "[" ? "]" : "}").join("");
  candidate += tail;

  try {
    JSON.parse(candidate);
    return candidate;
  } catch {
    return root === "[" ? "[]" : "{}";
  }
}

function isBioCategory(value: unknown): value is BioCategoryValue {
  return typeof value === "string" && (BIO_CATEGORY_VALUES as readonly string[]).includes(value);
}

function normalizeRelationWeight(weight: unknown): number | undefined {
  if (typeof weight !== "number" || Number.isNaN(weight)) {
    return undefined;
  }

  if (weight < 0) {
    return 0;
  }

  if (weight > 1) {
    return 1;
  }

  return weight;
}

function isAliasType(value: unknown): value is AliasTypeValue {
  return typeof value === "string" && (ALIAS_TYPE_VALUES as readonly string[]).includes(value);
}

function normalizeConfidence(value: unknown, fallback = 0): number {
  if (typeof value !== "number" || Number.isNaN(value)) {
    return fallback;
  }

  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/**
 * 功能：将模型返回的 JSON 文本解析并归一化为 ChapterAnalysisResponse。
 * 输入：raw - AI 返回的 JSON 字符串。
 * 输出：字段已过滤、类型已校验的结构化对象。
 * 异常：当 JSON 非法或顶层不是 object 时抛错。
 * 副作用：无。
 */
export function parseChapterAnalysisResponse(raw: string): ChapterAnalysisResponse {
  const repaired = repairJson(raw);
  const parsed: unknown = JSON.parse(repaired);

  if (!isRecord(parsed)) {
    throw new Error("AI response is not a JSON object");
  }

  const biographies = Array.isArray(parsed.biographies) ? parsed.biographies : [];
  const mentions = Array.isArray(parsed.mentions) ? parsed.mentions : [];
  const relationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];

  const normalizedBiographies: AiBiographyRecord[] = biographies
    .filter(isRecord)
    .filter((item) => typeof item.personaName === "string" && typeof item.event === "string" && isBioCategory(item.category))
    .map((item) => ({
      personaName: item.personaName as string,
      category   : item.category as BioCategoryValue,
      event      : item.event as string,
      title      : typeof item.title === "string" ? item.title : undefined,
      location   : typeof item.location === "string" ? item.location : undefined,
      virtualYear: typeof item.virtualYear === "string" ? item.virtualYear : undefined,
      ironyNote  : typeof item.ironyNote === "string" ? item.ironyNote : undefined
    }));

  const normalizedMentions: AiMention[] = mentions
    .filter(isRecord)
    .filter((item) => typeof item.personaName === "string" && typeof item.rawText === "string")
    .map((item) => ({
      personaName: item.personaName as string,
      rawText    : item.rawText as string,
      summary    : typeof item.summary === "string" ? item.summary : undefined,
      paraIndex  : typeof item.paraIndex === "number" ? item.paraIndex : undefined
    }));

  const normalizedRelationships: AiRelationship[] = relationships
    .filter(isRecord)
    .filter(
      (item) =>
        typeof item.sourceName === "string" &&
        typeof item.targetName === "string" &&
        typeof item.type === "string"
    )
    .map((item) => ({
      sourceName : item.sourceName as string,
      targetName : item.targetName as string,
      type       : item.type as string,
      weight     : normalizeRelationWeight(item.weight),
      description: typeof item.description === "string" ? item.description : undefined,
      evidence   : typeof item.evidence === "string" ? item.evidence : undefined
    }));

  return {
    biographies  : normalizedBiographies,
    mentions     : normalizedMentions,
    relationships: normalizedRelationships
  };
}

/**
 * 功能：章节人物名册条目（Phase 1 Roster Discovery AI 输出单条记录）。
 * 输入：无。
 * 输出：类型约束 ChapterRosterEntry。
 * 异常：无。
 * 副作用：无。
 */
export interface ChapterRosterEntry {
  /** 在原文中出现的字面称谓（精确字符串）。 */
  surfaceForm       : string;
  /** 对应已知人物的序号（与 Known Entities 列表 [N] 的 N 对应）。 */
  entityId?         : number;
  /** 确认为本书全新人物（不在已知档案中）。 */
  isNew?            : boolean;
  /** 泛化称谓，无法唯一指向某一人物，应忽略。 */
  generic?          : boolean;
  /**
   * 仅有称号/尊号/封号，原文中未透露其真实姓名（如"太祖皇帝"、"吴王"）。
   * 配合 isNew: true 使用，写入 Persona.nameType = TITLE_ONLY。
   */
  isTitleOnly?      : boolean;
  aliasType?        : AliasTypeValue;
  contextHint?      : AliasContextHint;
  suggestedRealName?: string;
  aliasConfidence?  : number;
}

export interface AliasContextHint {
  alias              : string;
  aliasType          : AliasTypeValue;
  coOccurringPersonas: string[];
  contextClue        : string;
  suggestedRealName? : string;
  confidence         : number;
}

export interface EnhancedChapterRosterEntry extends ChapterRosterEntry {
  aliasType?  : AliasTypeValue;
  contextHint?: AliasContextHint;
}

export interface AliasMappingResult {
  id?          : string;
  alias        : string;
  resolvedName : string | null;
  personaId    : string | null;
  aliasType    : AliasTypeValue;
  confidence   : number;
  evidence     : string;
  status       : "PENDING" | "CONFIRMED" | "REJECTED";
  chapterScope?: { start: number; end?: number };
}

export interface RegisterAliasInput {
  bookId       : string;
  personaId?   : string;
  alias        : string;
  resolvedName?: string;
  aliasType    : AliasTypeValue;
  confidence   : number;
  evidence?    : string;
  chapterStart?: number;
  chapterEnd?  : number;
  status?      : "PENDING" | "CONFIRMED" | "REJECTED";
  contextHash? : string;
}

/**
 * 功能：将 Phase 1 AI 返回的人物名册 JSON 文本解析为 ChapterRosterEntry 数组。
 * 输入：raw - AI 返回的 JSON 字符串。
 * 输出：已过滤、类型已校验的 ChapterRosterEntry 数组；解析失败时返回 []。
 * 异常：无（解析失败时静默返回空数组）。
 * 副作用：无。
 */
export function parseChapterRosterResponse(raw: string): ChapterRosterEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(repairJson(raw));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isRecord)
    .filter((item) => typeof item.surfaceForm === "string" && (item.surfaceForm).trim().length > 0)
    .map((item) => {
      const surfaceForm = (item.surfaceForm as string).trim();
      const aliasType = isAliasType(item.aliasType) ? item.aliasType : undefined;
      const suggestedRealName = typeof item.suggestedRealName === "string" && (item.suggestedRealName).trim().length > 0
        ? (item.suggestedRealName).trim()
        : undefined;
      const contextClue = typeof item.contextHint === "string" ? (item.contextHint).trim() : "";
      const aliasConfidence = normalizeConfidence(item.aliasConfidence, 0);

      const contextHint = aliasType && contextClue
        ? {
          alias              : surfaceForm,
          aliasType,
          coOccurringPersonas: Array.isArray(item.coOccurringPersonas)
            ? item.coOccurringPersonas.filter((name): name is string => typeof name === "string")
            : [],
          contextClue,
          suggestedRealName,
          confidence: aliasConfidence
        }
        : undefined;

      return {
        surfaceForm,
        entityId       : typeof item.entityId === "number" ? item.entityId : undefined,
        isNew          : item.isNew === true,
        generic        : item.generic === true,
        isTitleOnly    : item.isTitleOnly === true,
        aliasType,
        contextHint,
        suggestedRealName,
        aliasConfidence: aliasType ? aliasConfidence : undefined
      };
    });
}

export function parseEnhancedChapterRosterResponse(raw: string): EnhancedChapterRosterEntry[] {
  return parseChapterRosterResponse(raw);
}

/**
 * 功能：Phase 5 称号真名溯源 AI 输出单条记录。
 * 输入：无。
 * 输出：类型约束 TitleResolutionEntry。
 * 异常：无。
 * 副作用：无。
 */
export interface TitleResolutionEntry {
  /** Persona 主键，便于直接定位更新目标。 */
  personaId      : string;
  /** 书中称号（如"太祖皇帝"）。 */
  title          : string;
  /** AI 推断出的历史真名；无法判断时为 null。 */
  realName       : string | null;
  /** 置信度 0.0-1.0。 */
  confidence     : number;
  /** 推理依据（≤ 30字）。 */
  historicalNote?: string;
}

/**
 * 功能：Phase 5 称号真名溯源——批量 AI 推断输入结构。
 * 输入：无。
 * 输出：类型约束 TitleResolutionInput。
 * 异常：无。
 * 副作用：无。
 */
export interface TitleResolutionInput {
  bookTitle: string;
  /** 待溯源的称号条目列表（一本书中所有 nameType = TITLE_ONLY 的 Persona）。 */
  entries: Array<{
    personaId   : string;
    title       : string;
    localSummary: string | null;
  }>;
}

/**
 * 功能：将 Phase 5 AI 返回的称号溯源 JSON 文本解析为 TitleResolutionEntry 数组。
 * 输入：raw - AI 返回的 JSON 字符串；personaIdByTitle - 称号 → personaId 映射（用于还原 ID）。
 * 输出：已过滤、类型已校验的 TitleResolutionEntry 数组；解析失败返回 []。
 * 异常：无（解析失败时静默返回空数组）。
 * 副作用：无。
 */
export function parseTitleResolutionResponse(
  raw: string,
  personaIdByTitle: Map<string, string>
): TitleResolutionEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results: TitleResolutionEntry[] = [];
  for (const item of parsed) {
    if (!isRecord(item)) continue;
    if (typeof item.title !== "string" || (item.title).trim().length === 0) continue;

    const title = (item.title).trim();
    const personaId = personaIdByTitle.get(title);
    if (!personaId) continue;

    const rawConfidence = typeof item.confidence === "number" ? item.confidence : 0;
    const confidence = Math.min(1, Math.max(0, rawConfidence));
    const realName = typeof item.realName === "string" && (item.realName).trim().length > 0
      ? (item.realName).trim()
      : null;

    results.push({
      personaId,
      title,
      realName,
      confidence,
      historicalNote: typeof item.historicalNote === "string" ? item.historicalNote : undefined
    });
  }

  return results;
}
