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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBioCategory(value: unknown): value is BioCategoryValue {
  return typeof value === "string" && (BIO_CATEGORY_VALUES as readonly string[]).includes(value);
}

/**
 * 功能：将模型返回的 JSON 文本解析并归一化为 ChapterAnalysisResponse。
 * 输入：raw - AI 返回的 JSON 字符串。
 * 输出：字段已过滤、类型已校验的结构化对象。
 * 异常：当 JSON 非法或顶层不是 object 时抛错。
 * 副作用：无。
 */
export function parseChapterAnalysisResponse(raw: string): ChapterAnalysisResponse {
  const parsed: unknown = JSON.parse(raw);

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
      weight     : typeof item.weight === "number" ? item.weight : undefined,
      description: typeof item.description === "string" ? item.description : undefined
    }));

  return {
    biographies  : normalizedBiographies,
    mentions     : normalizedMentions,
    relationships: normalizedRelationships
  };
}
