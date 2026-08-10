/**
 * Pass2 确定性护栏（guardrails.ts，零 LLM）
 *
 * 检查（防 v4 教训：6 类 337+ 垃圾 profile、关系碎片化）：
 * 1. 证据锚定：事实中出现的实体名必须在片正文可证（归一化子串匹配）
 * 2. 关系码校验：typeCode 必须在装载 skill 契约 relationshipCodes 闭集（validCodes）
 * 3. 泛称过滤：safety level 0 泛称不作为实体落库
 *
 * 输出：通过的事实/提及 + 丢弃记录（审计用）。
 * 架构依据：docs/architecture/13-agent-architecture-v5.md §2.2/Pass2
 */
import { isDeicticJunk } from "./nameAuthority.ts";
import type { EntityTypeStr, ExtractionSlice } from "./types.ts";

export type FactType = "BIOGRAPHY" | "RELATION" | "ITEM_TRANSFER" | "ORGANIZATION_EVENT" | "GENERIC";

export interface PersistableFact {
  factType             : FactType;
  sourceName           : string | null;
  targetName           : string | null;
  relationshipTypeCode?: string;
  eventCategory?       : string;
  evidence             : string;
  chapterNo            : number;
  payload              : Record<string, unknown>;
  confidence           : number;
}

export interface DropRecord {
  kind  : "relation" | "bioFact";
  reason: "name_not_in_text" | "invalid_code" | "deictic_junk" | "no_evidence" | "dependent_reference";
  detail: string;
}

/** 通过实体验收闸的实体（= 保留 facts 的全部参与者，带类型），供落库反推。 */
export interface AcceptedEntity {
  name    : string;
  type    : EntityTypeStr;
  /** 本章内的称呼（来自 slice.entities 对应实体，仅 canonical 命中时携带）。 */
  aliases?: string[];
}

export interface GuardrailResult {
  facts      : PersistableFact[];
  dropRecords: DropRecord[];
  /** 实体从保留事实的两端反推（v7：不再独立遍历 slice.entities 建实体）。 */
  entities   : AcceptedEntity[];
}

/** 合法传记事件分类（对齐 Prisma EventCategory 枚举，缺一即会落库失败）。 */
const VALID_EVENT_CATEGORIES = new Set(["BIRTH", "EXAM", "CAREER", "TRAVEL", "SOCIAL", "DEATH", "EVENT"]);

/** 归一化（去空白/全角空格/转小写）用于子串匹配。 */
export function normalizeForMatch(s: string): string {
  return s.replace(/[\s　]+/g, "").toLowerCase();
}

/** 名字是否出现在文本中（归一化子串匹配）。 */
export function isNameInText(name: string, text: string): boolean {
  const n = normalizeForMatch(name);
  if (n.length === 0) return false;
  return normalizeForMatch(text).includes(n);
}

/**
 * 从属/关系指称判定（实体验收闸②）。
 * 拦截 "X的妻/妾/夫/母/师/师兄/新娘…" 这类"某人的从属身份"，
 * 它们不是独立实体，不应入图谱。
 */
const DEPENDENT_REFERENCE_PATTERN = /^[^\s，。、]{1,6}的(妻|妾|夫|母|父|儿子|女儿|哥|弟|姐|妹|兄|嫂|侄|孙|孙女|师|师父|师兄|师弟|师傅|新娘|新妇|丈夫|老婆|女人|公子|小姐|夫人|老母|家眷|亲戚|朋友|邻居|仆人|管家|丫鬟|下人|孙子|孙子媳妇|儿媳妇|女婿)/;
export function isDependentReference(name: string): boolean {
  return DEPENDENT_REFERENCE_PATTERN.test(name.trim());
}

/**
 * 运行护栏：对一片提取结果做证据锚定 + 关系码校验 + 泛称过滤。
 *
 * @param slice 提取片
 * @param sliceText 片正文（证据锚定基准）
 * @param validCodes 有效关系码集合（装载 skill 契约 relationshipCodes）
 * @param junkList 虚指代词契约名单（可选；缺省用代码内默认名单）
 */
export function runGuardrails(
  slice     : ExtractionSlice,
  sliceText : string,
  validCodes: Set<string>,
  junkList? : ReadonlySet<string>
): GuardrailResult {
  const facts: PersistableFact[] = [];
  const dropRecords: DropRecord[] = [];

  // 表面形式 → 实体全部名字（canonical + aliases）：让"范老爷"能解析到 范进/范老爷 任一出现
  const surfaceMap = new Map<string, string[]>();
  for (const e of slice.entities) {
    const allNames = [e.canonical, ...(e.aliases ?? [])];
    for (const s of allNames) {
      surfaceMap.set(s.trim(), allNames);
    }
  }

  // 名字 → 类型（canonical/aliases → 所属实体 type），实体反推时保留类型。
  const typeByName = new Map<string, EntityTypeStr>();
  for (const e of slice.entities) {
    for (const s of [e.canonical, ...(e.aliases ?? [])]) {
      typeByName.set(s.trim(), e.type);
    }
  }

  /** 别名感知锚定：该表面形式对应实体的任一名字出现在正文即通过。 */
  function anchored(name: string): boolean {
    const names = surfaceMap.get(name.trim()) ?? [name];
    return names.some((n) => isNameInText(n, sliceText));
  }

  // 实体反推累积器：名字 → 类型（每个名字只留首次出现）。
  const acceptedEntities = new Map<string, EntityTypeStr>();
  /**
   * 记录一个名字作为实体参与者。
   * 返回 null = 通过；否则 = 拒绝原因（调用方丢弃该事实并留痕）。
   */
  function acceptEntity(name: string, type: EntityTypeStr): "deictic_junk" | "dependent_reference" | "name_not_in_text" | null {
    if (isDeicticJunk(name, junkList)) {
      return "deictic_junk";
    }
    if (isDependentReference(name)) {
      return "dependent_reference";
    }
    if (!anchored(name)) {
      return "name_not_in_text";
    }
    if (!acceptedEntities.has(name)) {
      acceptedEntities.set(name, typeByName.get(name) ?? type);
    }
    return null;
  }

  // 关系事实（检查顺序：非法码 → 指代兜底 → 无证据 → 实体验收 → 锚定）
  for (const rel of slice.relations) {
    if (!validCodes.has(rel.typeCode)) {
      dropRecords.push({ kind: "relation", reason: "invalid_code", detail: `${rel.typeCode}:${rel.sourceCanonical}→${rel.targetCanonical}` });
      continue;
    }
    if (isDeicticJunk(rel.sourceCanonical, junkList) || isDeicticJunk(rel.targetCanonical, junkList)) {
      dropRecords.push({ kind: "relation", reason: "deictic_junk", detail: rel.typeCode });
      continue;
    }
    if (!rel.evidence?.trim()) {
      dropRecords.push({ kind: "relation", reason: "no_evidence", detail: rel.typeCode });
      continue;
    }
    // 实体验收：两端都必须通过（从属指称/泛称/未锚定 → 丢弃，不再独立列举）
    const srcReject = acceptEntity(rel.sourceCanonical, "PERSON");
    const tgtReject = acceptEntity(rel.targetCanonical, "PERSON");
    if (srcReject || tgtReject) {
      dropRecords.push({ kind: "relation", reason: srcReject ?? tgtReject ?? "dependent_reference", detail: `${rel.typeCode}:${rel.sourceCanonical}→${rel.targetCanonical}` });
      continue;
    }
    facts.push({
      factType            : "RELATION",
      sourceName          : rel.sourceCanonical,
      targetName          : rel.targetCanonical,
      relationshipTypeCode: rel.typeCode,
      evidence            : rel.evidence,
      // v7 逐章提取：片即本章，chapterNo 天然正确（无需模型输出/反查）
      chapterNo           : slice.chapterNos[0] ?? 0,
      payload             : {},
      confidence          : 0.7
    });
  }

  // 传记事实（检查顺序：指代兜底 → 无证据 → 实体验收）
  for (const bio of slice.bioFacts) {
    if (isDeicticJunk(bio.subjectCanonical, junkList)) {
      dropRecords.push({ kind: "bioFact", reason: "deictic_junk", detail: bio.subjectCanonical });
      continue;
    }
    if (!bio.evidence?.trim()) {
      dropRecords.push({ kind: "bioFact", reason: "no_evidence", detail: bio.subjectCanonical });
      continue;
    }
    const reject = acceptEntity(bio.subjectCanonical, "PERSON");
    if (reject) {
      dropRecords.push({ kind: "bioFact", reason: reject, detail: bio.subjectCanonical });
      continue;
    }
    // 事件分类兜底：模型可能输出枚举外分类（如 MARRIAGE），落库会因 Prisma 枚举校验失败。
    const category = VALID_EVENT_CATEGORIES.has(bio.category) ? bio.category : "EVENT";
    facts.push({
      factType     : "BIOGRAPHY",
      sourceName   : bio.subjectCanonical,
      targetName   : null,
      eventCategory: category,
      evidence     : bio.evidence,
      // v7 逐章提取：片即本章，chapterNo 天然正确
      chapterNo    : slice.chapterNos[0] ?? 0,
      payload      : { summary: bio.summary, ...(bio.location ? { location: bio.location } : {}) },
      confidence   : 0.7
    });
  }

  // 最终实体列表：canonical 命中的带同片别名（供落库 + 身份 Pass 折叠），其余仅名字。
  const sliceEntityByCanonical = new Map(slice.entities.map((e) => [e.canonical.trim(), e]));
  const entities: AcceptedEntity[] = Array.from(acceptedEntities, ([name, type]) => {
    const source = sliceEntityByCanonical.get(name);
    return { name, type, ...(source?.aliases?.length ? { aliases: source.aliases } : {}) };
  });

  return { facts, dropRecords, entities };
}
