/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 PostAnalysisMerger 的合并建议生成逻辑，属于服务端核心业务逻辑层。
 * - 该模块在全书分析完成后运行，直接影响人物去重质量与人工审核工作量。
 *
 * 业务职责：
 * - 验证多层匹配策略（精确名称 / KB 别名 / 别名交叉）的候选生成与去重。
 * - 验证 D3 硬性约束：仅 confidence=1.0 的精确匹配可自动合并。
 * - 验证已有建议对跳过、同对去重保留高优先级等边界行为。
 *
 * 维护提示：
 * - 断言聚焦业务规则（状态推进、D3 约束、去重策略），不是简单技术实现细节。
 * - 若新增 Tier，需同步补充测试并确认 D3 约束仍成立。
 */

import { describe, expect, it, vi, beforeEach } from "vitest";
import type { PrismaClient } from "@/generated/prisma/client";
import type { FullRuntimeKnowledge } from "@/server/modules/knowledge/load-book-knowledge";

import { runPostAnalysisMerger } from "@/server/modules/analysis/services/PostAnalysisMerger";

// ────────────────────────────────────────────
// 工厂函数
// ────────────────────────────────────────────

function createPrismaMock() {
  const profileFindMany          = vi.fn().mockResolvedValue([]);
  const mergeSuggestionFindMany  = vi.fn().mockResolvedValue([]);
  const mergeSuggestionCreate    = vi.fn().mockResolvedValue({});
  const mentionFindMany          = vi.fn().mockResolvedValue([]);

  return {
    prisma: {
      profile        : { findMany: profileFindMany },
      mergeSuggestion: { findMany: mergeSuggestionFindMany, create: mergeSuggestionCreate },
      mention        : { findMany: mentionFindMany }
    } as never as PrismaClient,
    profileFindMany,
    mergeSuggestionFindMany,
    mergeSuggestionCreate,
    mentionFindMany
  };
}

/** 生成一条 profile 行，附带内联 persona 信息 */
function createProfileRow(overrides: {
  personaId  : string;
  name       : string;
  aliases?   : string[];
  confidence?: number;
  localName? : string;
}) {
  return {
    personaId: overrides.personaId,
    localName: overrides.localName ?? overrides.name,
    persona  : {
      id        : overrides.personaId,
      name      : overrides.name,
      aliases   : overrides.aliases ?? [],
      confidence: overrides.confidence ?? 1.0
    }
  };
}

const BOOK_ID = "book-1";

// ────────────────────────────────────────────
// 测试
// ────────────────────────────────────────────

describe("PostAnalysisMerger", () => {
  let mocks: ReturnType<typeof createPrismaMock>;

  beforeEach(() => {
    mocks = createPrismaMock();
  });

  // ── 1. 少于 2 个 persona 时提前退出 ──

  it("returns zero when fewer than 2 personas", async () => {
    // Arrange: 只返回 1 条 profile
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "范进" })
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert
    expect(result).toEqual({ created: 0, autoMerged: 0 });
    expect(mocks.mergeSuggestionCreate).not.toHaveBeenCalled();
  });

  // ── 2. Tier 1: 精确名称匹配 → AUTO_MERGED ──

  it("creates AUTO_MERGED suggestion for exact name match (Tier 1)", async () => {
    // Arrange: 两个 persona 名字相同
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "范进", confidence: 0.8 }),
      createProfileRow({ personaId: "p2", name: "范进", confidence: 0.95 })
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert
    expect(result).toEqual({ created: 1, autoMerged: 1 });
    expect(mocks.mergeSuggestionCreate).toHaveBeenCalledOnce();

    const createCall = mocks.mergeSuggestionCreate.mock.calls[0][0] as {
      data: { confidence: number; status: string; sourcePersonaId: string; targetPersonaId: string };
    };
    expect(createCall.data.confidence).toBe(1.0);
    expect(createCall.data.status).toBe("AUTO_MERGED");
    // target 应是置信度更高的 p2
    expect(createCall.data.targetPersonaId).toBe("p2");
    expect(createCall.data.sourcePersonaId).toBe("p1");
  });

  // ── 3. Tier 2: KB alias 映射 → PENDING ──

  it("creates PENDING suggestion for KB alias match (Tier 2)", async () => {
    // Arrange: persona p1 名为 "丞相"，KB aliasLookup 将 "丞相" 映射到 canonicalName "诸葛亮"
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "丞相" }),
      createProfileRow({ personaId: "p2", name: "诸葛亮" })
    ]);

    const aliasLookup = new Map<string, string>();
    aliasLookup.set("丞相", "诸葛亮");
    const runtimeKnowledge = { aliasLookup } as unknown as FullRuntimeKnowledge;

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, {
      bookId: BOOK_ID,
      runtimeKnowledge
    });

    // Assert
    expect(result.created).toBe(1);
    expect(result.autoMerged).toBe(0);

    const createCall = mocks.mergeSuggestionCreate.mock.calls[0][0] as {
      data: { confidence: number; status: string };
    };
    expect(createCall.data.confidence).toBe(0.90);
    expect(createCall.data.status).toBe("PENDING");
  });

  // ── 4. Tier 3: 别名交叉匹配 → PENDING ──

  it("creates PENDING suggestion for alias cross-match (Tier 3)", async () => {
    // Arrange: persona A 的 alias "孔明" 等于 persona B 的 name
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "诸葛亮", aliases: ["孔明"] }),
      createProfileRow({ personaId: "p2", name: "孔明" })
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert
    expect(result.created).toBe(1);
    expect(result.autoMerged).toBe(0);

    const createCall = mocks.mergeSuggestionCreate.mock.calls[0][0] as {
      data: { confidence: number; status: string };
    };
    expect(createCall.data.confidence).toBe(0.85);
    expect(createCall.data.status).toBe("PENDING");
  });

  // ── 5. D3 约束: confidence < 1.0 绝不自动合并 ──

  it("never auto-merges when confidence is below 1.0 (D3 constraint)", async () => {
    // Arrange: 同时触发 Tier 2 和 Tier 3
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "刘备", aliases: ["玄德"] }),
      createProfileRow({ personaId: "p2", name: "玄德" }),
      createProfileRow({ personaId: "p3", name: "关羽" })
    ]);

    const aliasLookup = new Map<string, string>();
    aliasLookup.set("关公", "关羽");
    const runtimeKnowledge = { aliasLookup } as unknown as FullRuntimeKnowledge;

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, {
      bookId: BOOK_ID,
      runtimeKnowledge
    });

    // Assert: 所有建议都是 PENDING（无 AUTO_MERGED）
    expect(result.autoMerged).toBe(0);
    for (const call of mocks.mergeSuggestionCreate.mock.calls) {
      const data = (call[0] as { data: { status: string } }).data;
      expect(data.status).toBe("PENDING");
    }
  });

  // ── 6. 去重: 同一对只保留最高优先级（最小 tier）的候选 ──

  it("deduplicates same pair keeping highest priority tier", async () => {
    // Arrange: p1 和 p2 同时命中 Tier 2（KB alias）和 Tier 3（别名交叉）
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "丞相", aliases: ["诸葛亮"] }),
      createProfileRow({ personaId: "p2", name: "诸葛亮" })
    ]);

    const aliasLookup = new Map<string, string>();
    aliasLookup.set("丞相", "诸葛亮");
    const runtimeKnowledge = { aliasLookup } as unknown as FullRuntimeKnowledge;

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, {
      bookId: BOOK_ID,
      runtimeKnowledge
    });

    // Assert: 只生成 1 条建议（去重），且为 Tier 2 级别
    expect(result.created).toBe(1);
    expect(mocks.mergeSuggestionCreate).toHaveBeenCalledOnce();

    const createCall = mocks.mergeSuggestionCreate.mock.calls[0][0] as {
      data: { confidence: number; evidenceRefs: { tier: number } };
    };
    expect(createCall.data.evidenceRefs.tier).toBe(2);
    expect(createCall.data.confidence).toBe(0.90);
  });

  // ── 7. 跳过已存在的合并建议对 ──

  it("skips pairs that already have existing suggestions", async () => {
    // Arrange: 两个同名 persona，但已有 mergeSuggestion 记录
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "范进" }),
      createProfileRow({ personaId: "p2", name: "范进" })
    ]);
    mocks.mergeSuggestionFindMany.mockResolvedValueOnce([
      { sourcePersonaId: "p1", targetPersonaId: "p2" }
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert: 已存在的对被跳过，不创建新建议
    expect(result).toEqual({ created: 0, autoMerged: 0 });
    expect(mocks.mergeSuggestionCreate).not.toHaveBeenCalled();
  });

  // ── 8. Tier 4: 同姓 + 章节共现 ≥ 50% → PENDING (confidence 0.80) ──

  it("creates PENDING suggestion for same-surname with chapter co-occurrence ≥ 50% (Tier 4)", async () => {
    // Arrange: 两个同姓 persona "范进" 和 "范举人"，章节共现率 3/3 = 100%
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "范进" }),
      createProfileRow({ personaId: "p2", name: "范举人" })
    ]);
    // mention.findMany 返回：p1 出现在章节 1、2、3；p2 出现在章节 2、3、4
    // 交集 = {2,3}，min(3,3)=3，overlap/min = 2/3 ≈ 67% ≥ 50%
    mocks.mentionFindMany.mockResolvedValueOnce([
      { personaId: "p1", chapter: { no: 1 } },
      { personaId: "p1", chapter: { no: 2 } },
      { personaId: "p1", chapter: { no: 3 } },
      { personaId: "p2", chapter: { no: 2 } },
      { personaId: "p2", chapter: { no: 3 } },
      { personaId: "p2", chapter: { no: 4 } }
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert
    expect(result.created).toBe(1);
    expect(result.autoMerged).toBe(0);

    const createCall = mocks.mergeSuggestionCreate.mock.calls[0][0] as {
      data: {
        confidence     : number;
        status         : string;
        evidenceRefs   : { tier: number };
        sourcePersonaId: string;
        targetPersonaId: string;
      };
    };
    expect(createCall.data.confidence).toBe(0.80);
    expect(createCall.data.status).toBe("PENDING");
    expect(createCall.data.evidenceRefs.tier).toBe(4);
    // 两个 persona 应均在候选对中
    const ids = new Set([createCall.data.sourcePersonaId, createCall.data.targetPersonaId]);
    expect(ids.has("p1")).toBe(true);
    expect(ids.has("p2")).toBe(true);
  });

  it("does not create suggestion when chapter co-occurrence is below 50% (Tier 4)", async () => {
    // Arrange: 同姓但共现率不足 50%
    // p1 出现在章节 1、2、3、4；p2 仅出现在章节 3（overlap=1, min=1→100%，换方向看 min=4，1/4=25%）
    // 使用 min 确保对称：p1 chapters {1,2,3,4}, p2 chapters {3,7} → overlap=1, min=2, 1/2=50%（刚好过）
    // 改为：p1 {1,2,3,4}, p2 {3} → overlap=1, min=1 → 100% (仍过)
    // 改为：p1 {1,2,3,4,5}, p2 {4,5,6,7,8,9} → overlap=2, min=5, 2/5=40% < 50%
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "范进" }),
      createProfileRow({ personaId: "p2", name: "范举人" })
    ]);
    mocks.mentionFindMany.mockResolvedValueOnce([
      { personaId: "p1", chapter: { no: 1 } },
      { personaId: "p1", chapter: { no: 2 } },
      { personaId: "p1", chapter: { no: 3 } },
      { personaId: "p1", chapter: { no: 4 } },
      { personaId: "p1", chapter: { no: 5 } },
      { personaId: "p2", chapter: { no: 4 } },
      { personaId: "p2", chapter: { no: 5 } },
      { personaId: "p2", chapter: { no: 6 } },
      { personaId: "p2", chapter: { no: 7 } },
      { personaId: "p2", chapter: { no: 8 } },
      { personaId: "p2", chapter: { no: 9 } }
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert: 共现率 2/5=40% < 50%，不创建建议
    expect(result).toEqual({ created: 0, autoMerged: 0 });
    expect(mocks.mergeSuggestionCreate).not.toHaveBeenCalled();
  });

  it("does not create suggestion for different surnames even with high co-occurrence (Tier 4)", async () => {
    // Arrange: 不同姓，共现率高
    mocks.profileFindMany.mockResolvedValueOnce([
      createProfileRow({ personaId: "p1", name: "范进" }),
      createProfileRow({ personaId: "p2", name: "周进" })
    ]);
    mocks.mentionFindMany.mockResolvedValueOnce([
      { personaId: "p1", chapter: { no: 1 } },
      { personaId: "p1", chapter: { no: 2 } },
      { personaId: "p2", chapter: { no: 1 } },
      { personaId: "p2", chapter: { no: 2 } }
    ]);

    // Act
    const result = await runPostAnalysisMerger(mocks.prisma, { bookId: BOOK_ID });

    // Assert: 不同姓，不触发 Tier 4
    expect(result).toEqual({ created: 0, autoMerged: 0 });
    expect(mocks.mergeSuggestionCreate).not.toHaveBeenCalled();
  });
});
