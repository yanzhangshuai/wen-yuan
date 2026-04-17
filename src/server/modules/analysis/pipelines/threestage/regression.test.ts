/**
 * 文件定位（三阶段管线 · 跨 BookType 回归 fixture 测试）：
 * - 契约源：T08 `char-ext-08-regression-fixtures`，遵循 §0-1 白名单 + §0-5 区段硬约束。
 * - 覆盖 5 个 BookTypeCode（CLASSICAL_NOVEL / HEROIC_NOVEL / HISTORICAL_NOVEL /
 *   MYTHOLOGICAL_NOVEL / GENERIC）；每个 BookType 对应一个 `__fixtures__/<slug>/` 目录。
 * - 本测试**纯规则层**：不调用任何真实 LLM；`llm-response-fixtures.json` 即为伪造的
 *   Stage A 原始产物，直接喂给 `enforceRegionOverride` 并与 `expected-mentions.json`
 *   对账。这样 fixture 的 expected 值是 self-consistent（与代码行为对齐），可作为
 *   未来重构的 regression 护栏。
 *
 * 断言维度：
 * 1. `preprocessChapter` 的 coverage 五段占比 ≈ `expected-regions.json` ±5% 漂移；
 *    confidence / regionCount / deathMarkerCandidates 精确相等。
 * 2. `enforceRegionOverride` 对每条 raw mention 的覆写结果（identityClaim、
 *    narrativeRegionType、regionOverrideApplied）与 fixture 中的 expected 完全一致。
 * 3. 校准后 identityClaim 分布（SELF/QUOTED/REPORTED/HISTORICAL/IMPERSONATING/UNSURE）
 *    与 fixture 中的 distribution 完全一致（提供一行式断言供 eyeballing）。
 */
import fs from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { preprocessChapter } from "@/server/modules/analysis/preprocessor/ChapterPreprocessor";
import { enforceRegionOverride } from "@/server/modules/analysis/pipelines/threestage/stageA/enforceRegionOverride";
import type {
  StageAMention,
  StageARawMention
} from "@/server/modules/analysis/pipelines/threestage/stageA/types";
import type { IdentityClaim } from "@/generated/prisma/enums";

/** fixture 目录 slug（与 BookTypeCode 一一对应）。 */
const FIXTURE_SLUGS = ["classical", "heroic", "historical", "mythological", "generic"] as const;
type FixtureSlug = (typeof FIXTURE_SLUGS)[number];

/** slug → BookTypeCode 映射（仅用于测试标题人类可读性，非断言字段）。 */
const SLUG_BOOK_TYPE: Record<FixtureSlug, string> = {
  classical   : "CLASSICAL_NOVEL",
  heroic      : "HEROIC_NOVEL",
  historical  : "HISTORICAL_NOVEL",
  mythological: "MYTHOLOGICAL_NOVEL",
  generic     : "GENERIC"
};

/** coverage 占比允许的漂移（±5% 绝对差）。 */
const COVERAGE_DRIFT_TOLERANCE = 0.05;

/** fixture 根目录（相对本测试文件）。 */
const FIXTURES_ROOT = path.resolve(__dirname, "./__fixtures__");

interface ExpectedRegions {
  chapterLength        : number;
  coverage             : Record<"narrative" | "poem" | "dialogue" | "commentary" | "unclassified", number>;
  confidence           : "HIGH" | "LOW";
  regionCount          : number;
  regionTypeCounts     : Record<string, number>;
  deathMarkerCandidates: number;
}

interface RawMentionEntry extends StageARawMention {
  id: string;
}

interface LlmResponseFixture {
  description: string;
  rawMentions: RawMentionEntry[];
}

interface ExpectedMentionCase {
  id                   : string;
  identityClaim        : IdentityClaim;
  narrativeRegionType  : StageAMention["narrativeRegionType"];
  regionOverrideApplied: string | null;
  spanResolved         : boolean;
}

interface ExpectedMentions {
  description : string;
  cases       : ExpectedMentionCase[];
  distribution: Record<IdentityClaim, number>;
}

function loadFixture(slug: FixtureSlug): {
  chapterText     : string;
  expectedRegions : ExpectedRegions;
  llmResponse     : LlmResponseFixture;
  expectedMentions: ExpectedMentions;
} {
  const dir = path.join(FIXTURES_ROOT, slug);
  return {
    chapterText     : fs.readFileSync(path.join(dir, "chapter-text.txt"), "utf8"),
    expectedRegions : JSON.parse(fs.readFileSync(path.join(dir, "expected-regions.json"), "utf8")),
    llmResponse     : JSON.parse(fs.readFileSync(path.join(dir, "llm-response-fixtures.json"), "utf8")),
    expectedMentions: JSON.parse(fs.readFileSync(path.join(dir, "expected-mentions.json"), "utf8"))
  };
}

describe.each(FIXTURE_SLUGS)("threestage regression fixture · %s", (slug) => {
  const { chapterText, expectedRegions, llmResponse, expectedMentions } = loadFixture(slug);

  it(`[${SLUG_BOOK_TYPE[slug]}] chapter text is ≥ 200 chars and whitelist-safe`, () => {
    // PRD 硬约束：每个 fixture chapter 至少 200 字，保证有足够语料触发多区段切分。
    expect(chapterText.length).toBeGreaterThanOrEqual(200);
    // 章节长度记录与 expected-regions 对齐，防止 fixture 被意外篡改。
    expect(chapterText.length).toBe(expectedRegions.chapterLength);
  });

  it(`[${SLUG_BOOK_TYPE[slug]}] preprocessChapter coverage drifts within ±5%`, () => {
    const result = preprocessChapter(chapterText, 1);

    // confidence / regionCount / deathMarkerCandidates 是离散断言，必须精确匹配；
    // coverage 是浮点占比，允许小幅漂移（§0-4 实现层细节调整不必破坏 fixture）。
    expect(result.confidence).toBe(expectedRegions.confidence);
    expect(result.regions.length).toBe(expectedRegions.regionCount);
    expect(result.deathMarkerHits.length).toBe(expectedRegions.deathMarkerCandidates);

    const coverageKeys: Array<keyof ExpectedRegions["coverage"]> = [
      "narrative", "poem", "dialogue", "commentary", "unclassified"
    ];
    for (const key of coverageKeys) {
      const actual = result.coverage[key];
      const expected = expectedRegions.coverage[key];
      expect(
        Math.abs(actual - expected),
        `coverage.${key} drift too large: actual=${actual}, expected=${expected}`
      ).toBeLessThanOrEqual(COVERAGE_DRIFT_TOLERANCE);
    }

    // regionTypeCounts 精确匹配：类型计数漂移意味着切分规则改变，值得显式关注。
    const actualCounts = result.regions.reduce<Record<string, number>>((acc, r) => {
      acc[r.type] = (acc[r.type] ?? 0) + 1;
      return acc;
    }, {});
    expect(actualCounts).toEqual(expectedRegions.regionTypeCounts);
  });

  it(`[${SLUG_BOOK_TYPE[slug]}] enforceRegionOverride yields expected identityClaim per mention`, () => {
    const { regions } = preprocessChapter(chapterText, 1);

    // 用 id 建索引，保证 raw 和 expected 按 id 对齐（避免数组顺序耦合）。
    const rawById = new Map(llmResponse.rawMentions.map((m) => [m.id, m]));

    expect(
      rawById.size,
      "raw mentions ids must be unique and match expected cases"
    ).toBe(expectedMentions.cases.length);

    const claimDistribution: Record<IdentityClaim, number> = {
      SELF         : 0,
      QUOTED       : 0,
      REPORTED     : 0,
      HISTORICAL   : 0,
      IMPERSONATING: 0,
      UNSURE       : 0
    };

    for (const expectedCase of expectedMentions.cases) {
      const raw = rawById.get(expectedCase.id);
      expect(raw, `raw mention missing for id=${expectedCase.id}`).toBeDefined();
      if (raw === undefined) continue; // type narrow; guarded by expect above

      const { id: _id, ...rawWithoutId } = raw;
      const enforced = enforceRegionOverride(rawWithoutId, chapterText, regions);

      expect(
        enforced.identityClaim,
        `[${slug}/${expectedCase.id}] identityClaim mismatch`
      ).toBe(expectedCase.identityClaim);

      expect(
        enforced.narrativeRegionType,
        `[${slug}/${expectedCase.id}] narrativeRegionType mismatch`
      ).toBe(expectedCase.narrativeRegionType);

      expect(
        enforced.regionOverrideApplied,
        `[${slug}/${expectedCase.id}] regionOverrideApplied mismatch`
      ).toBe(expectedCase.regionOverrideApplied);

      if (expectedCase.spanResolved) {
        expect(
          enforced.spanStart,
          `[${slug}/${expectedCase.id}] spanStart should resolve`
        ).not.toBeNull();
        expect(
          enforced.spanEnd,
          `[${slug}/${expectedCase.id}] spanEnd should resolve`
        ).not.toBeNull();
      }

      claimDistribution[enforced.identityClaim] += 1;
    }

    // 总体 identityClaim 分布对账：便于 code review 时一眼判断规则层行为是否漂移。
    expect(claimDistribution).toEqual(expectedMentions.distribution);
  });
});
