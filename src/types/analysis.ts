/**
 * 文件定位（Next.js 应用内角色）：
 * - 该文件是“分析域（analysis）共享类型与解析工具层”，位于 `src/types`，被服务端分析流水线与部分 API DTO 映射共同依赖。
 * - 本文件不直接参与页面渲染，但它决定了 AI 输出、数据库写入前结构、服务间契约的稳定性。
 *
 * 核心职责：
 * - 约束 AI 返回 JSON 的业务字段语义；
 * - 提供容错解析与归一化逻辑，避免大模型非结构化输出直接污染下游；
 * - 为各阶段（人物名册、关系抽取、称号溯源）定义明确的数据契约。
 *
 * 运行环境：
 * - 纯 TypeScript 运行时工具，可在 Node.js 服务端（Next.js route.ts / server action / service）中执行；
 * - 不依赖浏览器 API。
 */
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
   * 人物主键 ID（来自 profiles/personas）。
   * - 业务意义：即便出现同名人物，模型与后处理也能靠 ID 建立稳定映射，避免串人。
   */
  personaId    : string;
  /** 人物规范主名（用于提示词中的 canonical anchor）。 */
  canonicalName: string;
  /** 人物别名集合（称谓、字、号、官职称呼等）。 */
  aliases      : string[];
  /**
   * 人物局部摘要（可空）。
   * - 空值语义：尚无摘要或摘要生成失败，不代表人物无信息。
   */
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
  /** AI 识别的人物名（可能是主名，也可能是别名/称号）。 */
  personaName: string;
  /** 原文证据片段，供后续人工复核与定位。 */
  rawText    : string;
  /** 可选摘要，说明该提及在上下文中的含义。 */
  summary?   : string;
  /** 可选段落下标（用于回写定位）。 */
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
  /** 事件归属的人物名。 */
  personaName : string;
  /** 事件类别（出生/仕途/交游等），必须命中白名单枚举。 */
  category    : BioCategoryValue;
  /** 事件正文描述。 */
  event       : string;
  /** 可选事件标题（更短标签）。 */
  title?      : string;
  /** 可选地点。 */
  location?   : string;
  /** 可选虚拟纪年（古籍常见模糊时间表达）。 */
  virtualYear?: string;
  /** 可选反讽/讥评备注，服务于文学分析场景。 */
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
  /** 关系起点人物。 */
  sourceName  : string;
  /** 关系终点人物。 */
  targetName  : string;
  /** 关系类型（如师生、亲属、政治同盟等）。 */
  type        : string;
  /** 关系强度，归一化到 0-1。 */
  weight?     : number;
  /** 关系描述文本。 */
  description?: string;
  /** 原文证据或推理依据。 */
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
  /** 生平事件列表。 */
  biographies  : AiBiographyRecord[];
  /** 原文提及列表。 */
  mentions     : AiMention[];
  /** 人物关系列表。 */
  relationships: AiRelationship[];
}

/**
 * 别名类型白名单。
 * - 这是业务规则，不是技术限制；
 * - 与别名注册、冲突消解、后台审核流程强耦合，新增枚举需要同步全链路。
 */
export const ALIAS_TYPE_VALUES = [
  "TITLE",
  "POSITION",
  "KINSHIP",
  "NICKNAME",
  "COURTESY_NAME"
] as const;

export type AliasTypeValue = (typeof ALIAS_TYPE_VALUES)[number];

/**
 * 运行时类型守卫：判断 unknown 是否为普通对象（非数组、非 null）。
 * - 业务目的：AI 输出常出现字段错位或顶层类型漂移，先做最小形态校验再读取字段可降低崩溃风险。
 */
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
  // Step 1: 去除 Markdown 代码块包裹。
  // 原因：模型常返回 ```json ... ```，直接 JSON.parse 会失败。
  const s = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();

  // Step 2: 尝试直接解析。
  // 若成功，优先保留原文本，避免“过度修复”引入新偏差。
  try {
    JSON.parse(s);
    return s;
  } catch {
    /* fall through to repair */
  }

  // Step 3: 基于栈扫描，记录最后一个安全截断位置。
  // 业务背景：当输出被 token 截断时，尾部最容易出现未闭合括号/字符串。
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
      // 只在“完成闭合”时推进 safe end，避免截到半结构。
      lastSafeEnd = i + 1;
    }
  }

  // Step 4: 截到最后安全位置，去掉末尾逗号，补齐剩余括号。
  // 目标是返回“最小可解析 JSON”，让上游进入降级路径，而不是直接抛异常中断整章流程。
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
  // 统一按白名单判断，避免模型生成“近义但不合法”的类别污染数据库枚举。
  return typeof value === "string" && (BIO_CATEGORY_VALUES as readonly string[]).includes(value);
}

function normalizeRelationWeight(weight: unknown): number | undefined {
  // 关系权重允许缺失；缺失表示“模型未提供”而非 0。
  if (typeof weight !== "number" || Number.isNaN(weight)) {
    return undefined;
  }

  if (weight < 0) {
    // 防御性截断：负值对业务无意义，归零处理。
    return 0;
  }

  if (weight > 1) {
    // 防御性截断：超过 1 视为过界噪声，归一到上限。
    return 1;
  }

  return weight;
}

function isAliasType(value: unknown): value is AliasTypeValue {
  return typeof value === "string" && (ALIAS_TYPE_VALUES as readonly string[]).includes(value);
}

function normalizeConfidence(value: unknown, fallback = 0): number {
  // 统一置信度规则：非法值走 fallback，合法数值强制压到 [0,1]。
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
  // Step 1: 先修复再解析，容忍模型输出的 Markdown 包裹或截断问题。
  const repaired = repairJson(raw);
  const parsed: unknown = JSON.parse(repaired);

  if (!isRecord(parsed)) {
    // 顶层不是对象时直接失败：这是结构契约破坏，继续处理会带来更隐蔽错误。
    throw new Error("AI response is not a JSON object");
  }

  // Step 2: 对三类主字段做“数组兜底”，保证后续 map/filter 可安全执行。
  const biographies = Array.isArray(parsed.biographies) ? parsed.biographies : [];
  const mentions = Array.isArray(parsed.mentions) ? parsed.mentions : [];
  const relationships = Array.isArray(parsed.relationships) ? parsed.relationships : [];

  // Step 3: biographies 逐条做最小字段校验与可选字段收敛。
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

  // Step 4: mentions 仅保留含 personaName + rawText 的有效项。
  const normalizedMentions: AiMention[] = mentions
    .filter(isRecord)
    .filter((item) => typeof item.personaName === "string" && typeof item.rawText === "string")
    .map((item) => ({
      personaName: item.personaName as string,
      rawText    : item.rawText as string,
      summary    : typeof item.summary === "string" ? item.summary : undefined,
      paraIndex  : typeof item.paraIndex === "number" ? item.paraIndex : undefined
    }));

  // Step 5: relationships 仅保留关系三元组完整的记录，权重做区间归一化。
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

  // Step 6: 返回结构稳定对象，供下游入库/图谱计算直接消费。
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
  /** 称谓类型（头衔/官职/亲属等），用于后续别名映射策略分流。 */
  aliasType?        : AliasTypeValue;
  /** 由上下文推断出的补充线索，供别名消歧流程使用。 */
  contextHint?      : AliasContextHint;
  /** 建议真名，属于模型猜测结果，需要后续验证。 */
  suggestedRealName?: string;
  /** 模型对 aliasType/建议映射的置信度，0-1。 */
  aliasConfidence?  : number;
}

export interface AliasContextHint {
  /** 需要解释的别名文本。 */
  alias              : string;
  /** 别名类别。 */
  aliasType          : AliasTypeValue;
  /** 同段共现人物列表，用于关系上下文消歧。 */
  coOccurringPersonas: string[];
  /** 关键语境线索（例如官职、称呼语气、事件同场信息）。 */
  contextClue        : string;
  /** 可选建议真名。 */
  suggestedRealName? : string;
  /** 线索可信度 0-1。 */
  confidence         : number;
}

export interface EnhancedChapterRosterEntry extends ChapterRosterEntry {
  /** 与基础条目同义，增强类型可在后续阶段继续覆写。 */
  aliasType?  : AliasTypeValue;
  /** 与基础条目同义，增强类型可携带更丰富上下文。 */
  contextHint?: AliasContextHint;
}

export interface AliasMappingResult {
  /** 映射记录主键（数据库已有记录时存在）。 */
  id?          : string;
  /** 别名字面值。 */
  alias        : string;
  /** 解析后的规范姓名；null 表示尚未确定。 */
  resolvedName : string | null;
  /** 关联 personaId；null 表示仍在待定态。 */
  personaId    : string | null;
  /** 别名类别。 */
  aliasType    : AliasTypeValue;
  /** 置信度 0-1。 */
  confidence   : number;
  /** 证据文本，便于审核和追溯。 */
  evidence     : string;
  /** 状态机：待确认/已确认/已拒绝/模型推断。 */
  status       : "PENDING" | "CONFIRMED" | "REJECTED" | "LLM_INFERRED";
  /** 生效章节范围（用于同名称谓在不同章节语义变化的场景）。 */
  chapterScope?: { start: number; end?: number };
}

export interface RegisterAliasInput {
  /** 书籍 ID。 */
  bookId       : string;
  /** 目标人物 ID；未知时可不传，后续人工或流程补齐。 */
  personaId?   : string;
  /** 需要登记的别名。 */
  alias        : string;
  /** 可选规范姓名。 */
  resolvedName?: string;
  /** 别名类别。 */
  aliasType    : AliasTypeValue;
  /** 置信度。 */
  confidence   : number;
  /** 证据信息。 */
  evidence?    : string;
  /** 生效起始章节。 */
  chapterStart?: number;
  /** 生效结束章节。 */
  chapterEnd?  : number;
  /** 初始化状态。 */
  status?      : "PENDING" | "CONFIRMED" | "REJECTED" | "LLM_INFERRED";
  /** 可选上下文哈希，用于去重和冲突检测。 */
  contextHash? : string;
}

export interface TitleArbitrationTerm {
  /** 待判定称谓。 */
  surfaceForm             : string;
  /** 本章出现次数。 */
  chapterAppearanceCount  : number;
  /** 是否已有稳定别名绑定。 */
  hasStableAliasBinding   : boolean;
  /** 是否仅指向单一 persona（跨样本一致）。 */
  singlePersonaConsistency: boolean;
  /** 作为泛称出现的比例（越高越可能不是专名）。 */
  genericRatio            : number;
}

export interface TitleArbitrationInput {
  /** 书名，用于给模型提供文体与语境背景。 */
  bookTitle: string;
  /** 待仲裁称谓集合。 */
  terms    : TitleArbitrationTerm[];
}

export interface TitleArbitrationEntry {
  /** 被判定的称谓。 */
  surfaceForm   : string;
  /** 是否应视作“人格化专称”（true）而非泛称（false）。 */
  isPersonalized: boolean;
  /** 判定置信度。 */
  confidence    : number;
  /** 可选理由，用于审核。 */
  reason?       : string;
}

export function parseTitleArbitrationResponse(raw: string): TitleArbitrationEntry[] {
  let parsed: unknown;
  try {
    // 使用 repairJson 兼容模型输出噪声，失败时返回空数组做安全降级。
    parsed = JSON.parse(repairJson(raw));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  // 仅保留关键字段完整项，避免不完整条目进入后续规则链路。
  return parsed
    .filter(isRecord)
    .filter((item) => typeof item.surfaceForm === "string" && typeof item.isPersonalized === "boolean")
    .map((item) => ({
      surfaceForm   : (item.surfaceForm as string).trim(),
      isPersonalized: item.isPersonalized as boolean,
      confidence    : normalizeConfidence(item.confidence, 0),
      reason        : typeof item.reason === "string" ? item.reason : undefined
    }))
    .filter((item) => item.surfaceForm.length > 0);
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
    // 先修复 JSON，提升对截断和 Markdown 包裹的容错性。
    parsed = JSON.parse(repairJson(raw));
  } catch {
    // 这里返回 [] 而非抛错：名册阶段允许降级为空，避免整章处理硬失败。
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  // 分层过滤策略：
  // 1) 先保留 object 项；
  // 2) 再确保 surfaceForm 非空；
  // 3) 对可选字段做类型收敛与默认处理。
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

      // 仅当 aliasType 与 contextClue 同时存在时才构造 contextHint。
      // 业务原因：单独出现任一字段都不足以支持可靠消歧，避免误导下游映射。
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
        // entityId 是“已知实体回连”通道，缺失意味着新人物或未能识别。
        entityId       : typeof item.entityId === "number" ? item.entityId : undefined,
        // 这里使用 `=== true` 强制布尔语义，避免 `"true"` 等脏值误判。
        isNew          : item.isNew === true,
        generic        : item.generic === true,
        isTitleOnly    : item.isTitleOnly === true,
        aliasType,
        contextHint,
        suggestedRealName,
        // 仅 aliasType 存在时才保留置信度，避免“无类别置信度”的语义歧义。
        aliasConfidence: aliasType ? aliasConfidence : undefined
      };
    });
}

export function parseEnhancedChapterRosterResponse(raw: string): EnhancedChapterRosterEntry[] {
  // 当前增强版解析逻辑与基础版一致，保留独立函数名是为后续阶段扩展留接口。
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
    /** 待更新人物 ID。 */
    personaId   : string;
    /** 称号文本。 */
    title       : string;
    /** 局部摘要，可帮助模型做历史人物判定；null 代表暂无摘要。 */
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
    // 此处直接 parse 原文：上游通常输出严格 JSON；若失败则按空结果降级。
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  const results: TitleResolutionEntry[] = [];
  for (const item of parsed) {
    // 循环内使用 continue 做“逐条容错”，避免单条坏数据拖垮整批结果。
    if (!isRecord(item)) continue;
    if (typeof item.title !== "string" || (item.title).trim().length === 0) continue;

    const title = (item.title).trim();
    const personaId = personaIdByTitle.get(title);
    // 未命中映射时丢弃：说明该 title 不在本次待处理目标集，防止越权更新其他人物。
    if (!personaId) continue;

    const rawConfidence = typeof item.confidence === "number" ? item.confidence : 0;
    // 防御性截断置信度，保证后续阈值判断稳定。
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

// ─── Two-Pass Architecture Types ────────────────────────────────────────────

/**
 * Pass 1 独立章节提取输出：单个人物条目。
 * 不依赖任何已有 persona 数据，完全由 LLM 从原文中独立提取。
 */
export interface IndependentEntityEntry {
  /** 人物最可能的正式姓名（如"范进"）。 */
  name       : string;
  /** 本章出现的其他称谓（如["范举人","范老爷"]）。 */
  aliases    : string[];
  /** 简短人物描述（如"落魄书生，后中举人"），≤50字。 */
  description: string;
  /** 分类：PERSON=有名人物，MENTIONED_ONLY=仅被提及的历史/虚构人物。 */
  category   : "PERSON" | "MENTIONED_ONLY";
}

/**
 * Pass 1 单章提取结果。
 */
export interface ChapterEntityList {
  /** 章节 ID。 */
  chapterId: string;
  /** 章节号。 */
  chapterNo: number;
  /** 本章提取的人物列表。 */
  entities : IndependentEntityEntry[];
}

/**
 * Pass 2 全局消歧：候选合并组（输入给 LLM 判断）。
 */
export interface EntityCandidateGroup {
  /** 候选组 ID（自增序号）。 */
  groupId : number;
  /** 该组包含的所有称谓及其来源章节。 */
  members : Array<{
    name       : string;
    description: string;
    chapterNos : number[];
  }>;
}

/**
 * Pass 2 LLM 返回：合并决策。
 */
export interface EntityResolutionDecision {
  /** 对应输入的 groupId。 */
  groupId     : number;
  /** 是否应合并为同一人。 */
  shouldMerge : boolean;
  /** 合并后的正式名称。 */
  mergedName  : string;
  /** 合并后的所有别名（包括非正式名称）。 */
  mergedAliases: string[];
  /** 判断理由（≤30字）。 */
  reason      : string;
}

/**
 * Pass 2 解析 AI 返回的实体消歧 JSON。
 */
export function parseEntityResolutionResponse(raw: string): EntityResolutionDecision[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(repairJson(raw));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isRecord)
    .filter((item) =>
      typeof item.groupId === "number" &&
      typeof item.shouldMerge === "boolean" &&
      typeof item.mergedName === "string"
    )
    .map((item) => ({
      groupId      : item.groupId as number,
      shouldMerge  : item.shouldMerge as boolean,
      mergedName   : (item.mergedName as string).trim(),
      mergedAliases: Array.isArray(item.mergedAliases)
        ? (item.mergedAliases as unknown[]).filter((a): a is string => typeof a === "string").map(a => a.trim())
        : [],
      reason: typeof item.reason === "string" ? item.reason : ""
    }));
}

/**
 * Pass 1 解析 AI 返回的独立实体提取 JSON。
 * 增加 name 长度校验：> 10 字符的 name 视为垃圾实体（整句话被提取为人名）。
 */
export function parseIndependentExtractionResponse(raw: string): IndependentEntityEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(repairJson(raw));
  } catch {
    return [];
  }

  if (!Array.isArray(parsed)) return [];

  return parsed
    .filter(isRecord)
    .filter((item) =>
      typeof item.name === "string" &&
      (item.name as string).trim().length >= 2 &&
      (item.name as string).trim().length <= 10  // 防垃圾实体：超过 10 字符的"人名"几乎都是提取错误
    )
    .map((item) => ({
      name       : (item.name as string).trim(),
      aliases    : Array.isArray(item.aliases)
        ? (item.aliases as unknown[])
            .filter((a): a is string => typeof a === "string" && a.trim().length >= 2 && a.trim().length <= 10)
            .map(a => a.trim())
        : [],
      description: typeof item.description === "string" ? (item.description as string).trim().slice(0, 100) : "",
      category   : item.category === "MENTIONED_ONLY" ? "MENTIONED_ONLY" : "PERSON"
    }));
}
