import { describe, expect, it } from "vitest";
import type { GoldsetFileType } from "../goldset/schema.ts";
import type { ExtractionChapter } from "./types.ts";
import { computeEntityMetric, computeRelationMetric, evaluateAll, evaluateChapter, normalizeName, SYMMETRIC_CODES } from "./evaluate.ts";

/** 构造一个完整 goldset 实体（补齐 schema 输出类型必填字段）。 */
function person(canonical: string, aliases: string[] = [], nameType: "NAMED" | "TITLE_ONLY" = "NAMED"): GoldsetFileType["entities"][number] {
  return { canonical, type: "PERSON", nameType, aliases, firstAppearancePara: 1, activeChapters: [1] };
}

function goldset(overrides: Partial<GoldsetFileType>): GoldsetFileType {
  return {
    book: "测试书",
    chapterNo: 1,
    entities: [person("王冕", ["王相公"]), person("王冕母", ["母亲"], "TITLE_ONLY")],
    relations: [],
    bioFacts: [],
    ...overrides,
  };
}

function ext(overrides: Partial<ExtractionChapter>): ExtractionChapter {
  return { book: "测试书", chapterNo: 1, entities: [], relations: [], bioFacts: [], ...overrides };
}

describe("normalizeName", () => {
  it("去除全角空格与空白", () => {
    expect(normalizeName("　范进 ")).toBe("范进");
  });
});

describe("computeEntityMetric", () => {
  it("完全匹配 → F1=1", () => {
    const g = goldset({});
    const e = ext({
      entities: [
        { canonical: "王冕", type: "PERSON", aliases: ["王相公"] },
        { canonical: "王冕母", type: "PERSON", aliases: ["母亲"] },
      ],
    });
    const { metric } = computeEntityMetric(g.entities, e.entities);
    expect(metric.f1).toBe(1);
    expect(metric.matched).toBe(2);
  });

  it("漏一个实体 → recall 降为 0.5", () => {
    const g = goldset({});
    const e = ext({ entities: [{ canonical: "王冕", type: "PERSON" }] });
    const { metric } = computeEntityMetric(g.entities, e.entities);
    expect(metric.recall).toBe(0.5);
    expect(metric.f1).toBeCloseTo(2 / 3, 5);
  });

  it("名字命中但类型不一致 → 不匹配", () => {
    const g = goldset({});
    const e = ext({ entities: [{ canonical: "王冕", type: "LOCATION" }] });
    const { metric, typeMismatchEntities } = computeEntityMetric(g.entities, e.entities);
    expect(metric.matched).toBe(0);
    expect(typeMismatchEntities.length).toBeGreaterThan(0);
  });

  it("别名命中也算匹配", () => {
    const g = goldset({});
    const e = ext({ entities: [{ canonical: "王相公", type: "PERSON" }] });
    const { metric } = computeEntityMetric(g.entities, e.entities);
    expect(metric.matched).toBe(1);
  });
});

describe("computeRelationMetric", () => {
  it("SYMMETRIC 关系方向互换可匹配", () => {
    const g = goldset({
      entities: [person("范进"), person("胡氏")],
      relations: [{ typeCode: "夫妻", sourceCanonical: "范进", targetCanonical: "胡氏", evidence: "x", chapterNo: 1 }],
    });
    const e = ext({ relations: [{ typeCode: "夫妻", sourceCanonical: "胡氏", targetCanonical: "范进" }] });
    const { metric } = computeRelationMetric(g.entities, g.relations, e.relations);
    expect(metric.matched).toBe(1);
    expect(metric.symmetricMatched).toBe(1);
  });

  it("方向性关系（师生）互换不匹配", () => {
    const g = goldset({
      entities: [person("范进"), person("周进")],
      relations: [{ typeCode: "师生", sourceCanonical: "范进", targetCanonical: "周进", evidence: "x", chapterNo: 1 }],
    });
    const e = ext({ relations: [{ typeCode: "师生", sourceCanonical: "周进", targetCanonical: "范进" }] });
    const { metric } = computeRelationMetric(g.entities, g.relations, e.relations);
    expect(metric.matched).toBe(0);
  });

  it("SYMMETRIC_CODES 覆盖兄弟/夫妻/同年/同僚/朋友/仇敌", () => {
    for (const c of ["兄弟", "夫妻", "同年", "同僚", "朋友", "仇敌"]) {
      expect(SYMMETRIC_CODES.has(c)).toBe(true);
    }
    for (const c of ["父子", "母子", "师生", "主仆"]) {
      expect(SYMMETRIC_CODES.has(c)).toBe(false);
    }
  });
});

describe("evaluateAll（微平均）", () => {
  it("跨章累计 TP/FP/FN 后算 F1", () => {
    const g1 = goldset({});
    const e1 = ext({ entities: [{ canonical: "王冕", type: "PERSON" }] });
    const g2 = goldset({ chapterNo: 2 });
    const e2 = ext({ chapterNo: 2, entities: [{ canonical: "王冕", type: "PERSON" }] });
    const agg = evaluateAll([
      { goldset: g1, ext: e1 },
      { goldset: g2, ext: e2 },
    ]);
    // 每章：TP=1, FN=1（漏王冕母），FP=0 → 跨章 TP=2, FN=2
    expect(agg.entity.matched).toBe(2);
    expect(agg.entity.recall).toBe(0.5);
    expect(agg.chapters).toHaveLength(2);
  });
});

describe("evaluateChapter 报告字段", () => {
  it("goldMissing / extExtra 输出", () => {
    const g = goldset({});
    const e = ext({ entities: [{ canonical: "吴敬梓", type: "PERSON" }] });
    const r = evaluateChapter(g, e);
    expect(r.goldMissingEntities).toContain("王冕");
    expect(r.extExtraEntities).toContain("吴敬梓");
  });
});
