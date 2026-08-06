/**
 * eval-gate 核心 F1 计算（纯函数，可单测）。
 *
 * 匹配语义：
 * - 实体：名字命中（gold.canonical/aliases ∩ ext.canonical/aliases）且类型一致 → 命中。
 * - 关系：typeCode 一致 且 两端实体各自命中；SYMMETRIC 码允许 source/target 互换。
 * - 传记事实：subject 实体命中 + category 一致（summary 不计入匹配，仅报告）。
 *
 * F1 采用微平均（跨章累计 TP/FP/FN 后算），比章节级 F1 平均更稳。
 */
import type { GoldsetFileType } from "../goldset/schema.ts";
import type { ExtractedEntity, ExtractedRelation, ExtractedBioFact, ExtractionChapter } from "./types.ts";

/**
 * SYMMETRIC 关系码（允许方向互换）。
 * 临时静态表：data-model 落地 relationship_types 后改读 DB（direction 字段）。
 */
export const SYMMETRIC_CODES: ReadonlySet<string> = new Set(["兄弟", "夫妻", "同年", "同僚", "朋友", "仇敌"]);

/** 归一化：去掉首尾空白 + 全角空格。 */
export function normalizeName(s: string): string {
  return s.replace(/[\s　]+/g, "").trim();
}

/** 实体的名字集合（canonical + aliases，归一化后）。 */
export function entityNames(e: { canonical: string; aliases?: string[] }): Set<string> {
  const names = new Set<string>([normalizeName(e.canonical)]);
  for (const a of e.aliases ?? []) names.add(normalizeName(a));
  return names;
}

/** gold 实体是否命中给定名字（名字命中）。 */
export function goldEntityHitsName(gold: { canonical: string; aliases?: string[] }, name: string): boolean {
  return entityNames(gold).has(normalizeName(name));
}

export interface EntityMetric {
  matched: number;
  goldTotal: number;
  extTotal: number;
  precision: number;
  recall: number;
  f1: number;
}

export interface RelationMetric extends EntityMetric {
  symmetricMatched: number;
}

export interface ChapterEval {
  book: string;
  chapterNo: number;
  entity: EntityMetric;
  relation: RelationMetric;
  bioFact: EntityMetric;
  /** 类型不一致但名字命中的实体（记为 miss，单独报告） */
  typeMismatchEntities: { name: string; goldType: string; extType: string }[];
  /** gold 有、ext 没有的实体名（前 N） */
  goldMissingEntities: string[];
  /** ext 有、gold 没有的实体名（前 N） */
  extExtraEntities: string[];
  /** gold 有、ext 没有的关系描述（前 N） */
  goldMissingRelations: string[];
  /** ext 有、gold 没有的关系描述（前 N） */
  extExtraRelations: string[];
}

export interface AggregateEval {
  entity: EntityMetric;
  relation: RelationMetric;
  bioFact: EntityMetric;
  chapters: ChapterEval[];
  byBook: Map<string, { entity: EntityMetric; relation: RelationMetric }>;
}

function f1(p: number, r: number): number {
  if (p + r === 0) return 0;
  return (2 * p * r) / (p + r);
}

/** 实体匹配：gold 实体的名字集合与 ext 实体集合求交，贪婪配对（类型一致才算命中）。 */
export function computeEntityMetric(goldEntities: GoldsetFileType["entities"], extEntities: ExtractedEntity[]): {
  metric: EntityMetric;
  typeMismatchEntities: ChapterEval["typeMismatchEntities"];
  goldMissing: string[];
  extExtra: string[];
} {
  const extUsed = new Array<boolean>(extEntities.length).fill(false);
  let matched = 0;
  const typeMismatchEntities: ChapterEval["typeMismatchEntities"] = [];

  for (const g of goldEntities) {
    const gNames = entityNames(g);
    let hit = -1;
    for (let i = 0; i < extEntities.length; i++) {
      if (extUsed[i]) continue;
      const e = extEntities[i];
      const eNames = entityNames(e);
      const nameHit = [...gNames].some((n) => eNames.has(n)) || [...eNames].some((n) => gNames.has(n));
      if (!nameHit) continue;
      if (e.type === g.type) {
        hit = i;
        break;
      }
      // 名字命中但类型不一致：记录但不配对
      typeMismatchEntities.push({ name: e.canonical, goldType: g.type, extType: e.type });
    }
    if (hit >= 0) {
      extUsed[hit] = true;
      matched++;
    }
  }

  const precision = extEntities.length === 0 ? 0 : matched / extEntities.length;
  const recall = goldEntities.length === 0 ? 0 : matched / goldEntities.length;
  const metric: EntityMetric = { matched, goldTotal: goldEntities.length, extTotal: extEntities.length, precision, recall, f1: f1(precision, recall) };

  // 未命中的名字（仅名字维度，便于报告）
  const extNames = new Set(extEntities.flatMap((e) => [...entityNames(e)]));
  const goldMissing = goldEntities.filter((g) => ![...entityNames(g)].some((n) => extNames.has(n))).map((g) => g.canonical);
  const goldNames = new Set(goldEntities.flatMap((g) => [...entityNames(g)]));
  const extExtra = extEntities.filter((e) => ![...entityNames(e)].some((n) => goldNames.has(n))).map((e) => e.canonical);

  return { metric, typeMismatchEntities, goldMissing, extExtra };
}

/** 关系匹配：typeCode + 两端实体命中；SYMMETRIC 允许方向互换。 */
export function computeRelationMetric(
  goldEntities: GoldsetFileType["entities"],
  goldRelations: GoldsetFileType["relations"],
  extRelations: ExtractedRelation[],
): { metric: RelationMetric; goldMissing: string[]; extExtra: string[] } {
  const extUsed = new Array<boolean>(extRelations.length).fill(false);
  let matched = 0;
  let symmetricMatched = 0;

  for (const g of goldRelations) {
    for (let i = 0; i < extRelations.length; i++) {
      if (extUsed[i]) continue;
      const e = extRelations[i];
      if (e.typeCode !== g.typeCode) continue;
      const srcHit = goldEntityHitsName(goldEntities.find((x) => x.canonical === g.sourceCanonical) ?? { canonical: g.sourceCanonical }, e.sourceCanonical);
      const tgtHit = goldEntityHitsName(goldEntities.find((x) => x.canonical === g.targetCanonical) ?? { canonical: g.targetCanonical }, e.targetCanonical);
      let direct = srcHit && tgtHit;
      let swapped = false;
      if (!direct && SYMMETRIC_CODES.has(g.typeCode)) {
        swapped =
          goldEntityHitsName(goldEntities.find((x) => x.canonical === g.sourceCanonical) ?? { canonical: g.sourceCanonical }, e.targetCanonical) &&
          goldEntityHitsName(goldEntities.find((x) => x.canonical === g.targetCanonical) ?? { canonical: g.targetCanonical }, e.sourceCanonical);
      }
      if (direct || swapped) {
        extUsed[i] = true;
        matched++;
        if (swapped) symmetricMatched++;
        break;
      }
    }
  }

  const precision = extRelations.length === 0 ? 0 : matched / extRelations.length;
  const recall = goldRelations.length === 0 ? 0 : matched / goldRelations.length;
  const metric: RelationMetric = { matched, goldTotal: goldRelations.length, extTotal: extRelations.length, precision, recall, f1: f1(precision, recall), symmetricMatched };

  const fmt = (r: { typeCode: string; sourceCanonical: string; targetCanonical: string }) => `${r.typeCode}:${r.sourceCanonical}→${r.targetCanonical}`;
  // 未匹配的 gold / ext 关系（重算一遍配对，用于报告）
  const matchedGoldIdx = new Set<number>();
  const matchedExtIdx = new Set<number>();
  for (let gi = 0; gi < goldRelations.length; gi++) {
    const g = goldRelations[gi];
    for (let ei = 0; ei < extRelations.length; ei++) {
      if (matchedExtIdx.has(ei)) continue;
      const e = extRelations[ei];
      if (e.typeCode !== g.typeCode) continue;
      const hit = (a: string, b: string) => goldEntityHitsName(goldEntities.find((x) => x.canonical === a) ?? { canonical: a }, b);
      if ((hit(g.sourceCanonical, e.sourceCanonical) && hit(g.targetCanonical, e.targetCanonical)) || (SYMMETRIC_CODES.has(g.typeCode) && hit(g.sourceCanonical, e.targetCanonical) && hit(g.targetCanonical, e.sourceCanonical))) {
        matchedGoldIdx.add(gi);
        matchedExtIdx.add(ei);
        break;
      }
    }
  }
  const gMissing = goldRelations.filter((_, i) => !matchedGoldIdx.has(i)).map(fmt);
  const eExtra = extRelations.filter((_, i) => !matchedExtIdx.has(i)).map(fmt);

  return { metric, goldMissing: gMissing, extExtra: eExtra };
}

/** 传记事实匹配：subject 实体命中 + category 一致（summary 不计入）。 */
export function computeBioFactMetric(
  goldEntities: GoldsetFileType["entities"],
  goldBio: GoldsetFileType["bioFacts"],
  extBio: ExtractedBioFact[],
): EntityMetric {
  const extUsed = new Array<boolean>(extBio.length).fill(false);
  let matched = 0;
  for (const g of goldBio) {
    for (let i = 0; i < extBio.length; i++) {
      if (extUsed[i]) continue;
      const e = extBio[i];
      if (e.category !== g.category) continue;
      const subjHit = goldEntityHitsName(goldEntities.find((x) => x.canonical === g.subjectCanonical) ?? { canonical: g.subjectCanonical }, e.subjectCanonical);
      if (subjHit) {
        extUsed[i] = true;
        matched++;
        break;
      }
    }
  }
  const precision = extBio.length === 0 ? 0 : matched / extBio.length;
  const recall = goldBio.length === 0 ? 0 : matched / goldBio.length;
  return { matched, goldTotal: goldBio.length, extTotal: extBio.length, precision, recall, f1: f1(precision, recall) };
}

/** 单章评估。 */
export function evaluateChapter(goldset: GoldsetFileType, ext: ExtractionChapter): ChapterEval {
  const { metric: entity, typeMismatchEntities, goldMissing, extExtra } = computeEntityMetric(goldset.entities, ext.entities);
  const { metric: relation, goldMissing: rMiss, extExtra: rExtra } = computeRelationMetric(goldset.entities, goldset.relations, ext.relations);
  const bioFact = computeBioFactMetric(goldset.entities, goldset.bioFacts, ext.bioFacts);
  return {
    book: goldset.book,
    chapterNo: goldset.chapterNo,
    entity,
    relation,
    bioFact,
    typeMismatchEntities: typeMismatchEntities.slice(0, 10),
    goldMissingEntities: goldMissing.slice(0, 10),
    extExtraEntities: extExtra.slice(0, 10),
    goldMissingRelations: rMiss.slice(0, 10),
    extExtraRelations: rExtra.slice(0, 10),
  };
}

/** 跨章微平均。 */
export function evaluateAll(pairs: { goldset: GoldsetFileType; ext: ExtractionChapter }[]): AggregateEval {
  const chapters: ChapterEval[] = pairs.map((p) => evaluateChapter(p.goldset, p.ext));
  const byBook = new Map<string, { entity: EntityMetric; relation: RelationMetric }>();
  const agg = { tpE: 0, fpE: 0, fnE: 0, tpR: 0, fpR: 0, fnR: 0, tpB: 0, fpB: 0, fnB: 0 };

  for (const c of chapters) {
    agg.tpE += c.entity.matched;
    agg.fpE += c.entity.extTotal - c.entity.matched;
    agg.fnE += c.entity.goldTotal - c.entity.matched;
    agg.tpR += c.relation.matched;
    agg.fpR += c.relation.extTotal - c.relation.matched;
    agg.fnR += c.relation.goldTotal - c.relation.matched;
    agg.tpB += c.bioFact.matched;
    agg.fpB += c.bioFact.extTotal - c.bioFact.matched;
    agg.fnB += c.bioFact.goldTotal - c.bioFact.matched;

    const b = byBook.get(c.book) ?? { entity: { matched: 0, goldTotal: 0, extTotal: 0, precision: 0, recall: 0, f1: 0 }, relation: { matched: 0, goldTotal: 0, extTotal: 0, precision: 0, recall: 0, f1: 0, symmetricMatched: 0 } };
    b.entity.matched += c.entity.matched;
    b.entity.goldTotal += c.entity.goldTotal;
    b.entity.extTotal += c.entity.extTotal;
    b.relation.matched += c.relation.matched;
    b.relation.goldTotal += c.relation.goldTotal;
    b.relation.extTotal += c.relation.extTotal;
    byBook.set(c.book, b);
  }

  const aggF1 = (tp: number, fp: number, fn: number) => {
    const p = tp + fp === 0 ? 0 : tp / (tp + fp);
    const r = tp + fn === 0 ? 0 : tp / (tp + fn);
    return { precision: p, recall: r, f1: f1(p, r) };
  };
  const entity = { matched: agg.tpE, goldTotal: agg.tpE + agg.fnE, extTotal: agg.tpE + agg.fpE, ...aggF1(agg.tpE, agg.fpE, agg.fnE) };
  const relation: RelationMetric = { matched: agg.tpR, goldTotal: agg.tpR + agg.fnR, extTotal: agg.tpR + agg.fpR, ...aggF1(agg.tpR, agg.fpR, agg.fnR), symmetricMatched: 0 };
  const bioFact = { matched: agg.tpB, goldTotal: agg.tpB + agg.fnB, extTotal: agg.tpB + agg.fpB, ...aggF1(agg.tpB, agg.fpB, agg.fnB) };

  for (const [book, b] of byBook) {
    const pe = b.entity.matched / (b.entity.extTotal || 1);
    const re = b.entity.matched / (b.entity.goldTotal || 1);
    const pr = b.relation.matched / (b.relation.extTotal || 1);
    const rr = b.relation.matched / (b.relation.goldTotal || 1);
    byBook.set(book, {
      entity: { ...b.entity, precision: pe, recall: re, f1: f1(pe, re) },
      relation: { ...b.relation, precision: pr, recall: rr, f1: f1(pr, rr) },
    });
  }

  return { entity, relation, bioFact, chapters, byBook };
}
