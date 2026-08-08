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
import type { ExtractionSlice } from "./types.ts";

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
  reason: "name_not_in_text" | "invalid_code" | "deictic_junk" | "no_evidence";
  detail: string;
}

export interface GuardrailResult {
  facts      : PersistableFact[];
  dropRecords: DropRecord[];
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
 * 运行护栏：对一片提取结果做证据锚定 + 关系码校验 + 泛称过滤。
 *
 * @param slice 提取片
 * @param sliceText 片正文（证据锚定基准）
 * @param validCodes 有效关系码集合（装载 skill 契约 relationshipCodes）
 * @param junkList 虚指代词契约名单（可选；缺省用代码内默认名单）
 */
export function runGuardrails(
  slice: ExtractionSlice,
  sliceText: string,
  validCodes: Set<string>,
  junkList?: ReadonlySet<string>
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

  /** 别名感知锚定：该表面形式对应实体的任一名字出现在正文即通过。 */
  function anchored(name: string): boolean {
    const names = surfaceMap.get(name.trim()) ?? [name];
    return names.some((n) => isNameInText(n, sliceText));
  }

  // 关系事实（检查顺序：非法码 → 指代兜底 → 无证据 → 锚定）
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
    if (!anchored(rel.sourceCanonical) || !anchored(rel.targetCanonical)) {
      dropRecords.push({ kind: "relation", reason: "name_not_in_text", detail: rel.typeCode });
      continue;
    }
    facts.push({
      factType            : "RELATION",
      sourceName          : rel.sourceCanonical,
      targetName          : rel.targetCanonical,
      relationshipTypeCode: rel.typeCode,
      evidence            : rel.evidence,
      chapterNo           : slice.chapterNos[0] ?? 0,
      payload             : {},
      confidence          : 0.7
    });
  }

  // 传记事实（检查顺序：指代兜底 → 无证据 → 锚定）
  for (const bio of slice.bioFacts) {
    if (isDeicticJunk(bio.subjectCanonical, junkList)) {
      dropRecords.push({ kind: "bioFact", reason: "deictic_junk", detail: bio.subjectCanonical });
      continue;
    }
    if (!bio.evidence?.trim()) {
      dropRecords.push({ kind: "bioFact", reason: "no_evidence", detail: bio.subjectCanonical });
      continue;
    }
    if (!anchored(bio.subjectCanonical)) {
      dropRecords.push({ kind: "bioFact", reason: "name_not_in_text", detail: bio.subjectCanonical });
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
      chapterNo    : slice.chapterNos[0] ?? 0,
      payload      : { summary: bio.summary, ...(bio.location ? { location: bio.location } : {}) },
      confidence   : 0.7
    });
  }

  return { facts, dropRecords };
}
