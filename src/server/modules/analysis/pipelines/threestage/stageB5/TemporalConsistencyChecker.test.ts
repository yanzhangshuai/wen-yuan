/**
 * 被测对象：Stage B.5 `TemporalConsistencyChecker.check(bookId)`（§0-3 第①类 · 死后行动）。
 *
 * 测试目标：
 *   - 正例 1 条：SELF/NARRATIVE/章节>deathChapterNo → 产 IMPERSONATION_CANDIDATE；
 *   - 正例 2 条：IMPERSONATING/NARRATIVE 同样产出（冒名者本人也算）；
 *   - 反例：QUOTED / REPORTED / HISTORICAL / 非 NARRATIVE / 章节≤deathChapterNo → 不产；
 *   - deathChapterNo=null → persona 完全跳过，不出现在 reports 里；
 *   - 幂等：已有 PENDING+source=STAGE_B5_TEMPORAL+kind=IMPERSONATION_CANDIDATE → skipped_existing；
 *   - 非 STAGE_B5_TEMPORAL 的历史 PENDING 不阻塞本次写入；
 *   - evidence.postDeathMentions 字段完整、顺序为 chapterNo asc、多章全部收集；
 *   - 写入字段：confidence=0.9、source=STAGE_B5_TEMPORAL、status=PENDING、kind/subKind 正确、
 *     targetPersonaId 使用自指哨兵；
 *   - 返回值统计（personasScanned / suggestionsCreated / suggestionsSkipped）一致。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { TemporalB5PrismaClient } from "@/server/modules/analysis/pipelines/threestage/stageB5/TemporalConsistencyChecker";
import { TemporalConsistencyChecker } from "@/server/modules/analysis/pipelines/threestage/stageB5/TemporalConsistencyChecker";

// ── 类型别名：测试 fixture 用的最小字段 ────────────────────────────────────

interface PersonaRow {
  id            : string;
  deathChapterNo: number | null;
  bookId        : string; // 仅用于 mock 端过滤，不属于 Persona 字段
}

interface MentionRow {
  id                 : string;
  bookId             : string;
  promotedPersonaId  : string | null;
  chapterNo          : number;
  surfaceForm        : string;
  rawSpan            : string;
  identityClaim      : string;
  narrativeRegionType: string;
}

interface SuggestionRow {
  id             : string;
  bookId         : string;
  sourcePersonaId: string;
  targetPersonaId: string;
  status         : string;
  source         : string;
  confidence     : number;
  reason         : string;
  evidenceRefs   : unknown;
}

// ── Mock Prisma 工厂 ────────────────────────────────────────────────────

interface MockPrismaState {
  personas   : PersonaRow[];
  mentions   : MentionRow[];
  suggestions: SuggestionRow[];
  createdRows: SuggestionRow[];
}

/**
 * 构造一个内存版 Prisma mock，针对本 checker 使用到的字段做最小语义模拟。
 * 注：仅实现测试需要的过滤条件分支，不追求完整 Prisma 语义。
 */
function mockPrisma(initial: Partial<MockPrismaState>): {
  prisma: TemporalB5PrismaClient;
  state : MockPrismaState;
} {
  const state: MockPrismaState = {
    personas   : initial.personas ?? [],
    mentions   : initial.mentions ?? [],
    suggestions: initial.suggestions ?? [],
    createdRows: []
  };

  const prisma = {
    persona: {
      findMany: vi.fn(async ({ where }: { where: { deathChapterNo: { not: null }; personaMentions: { some: { bookId: string } } } }) => {
        const bookId = where.personaMentions.some.bookId;
        return state.personas
          .filter(
            (p) =>
              p.bookId === bookId &&
              p.deathChapterNo !== null &&
              p.deathChapterNo !== undefined
          )
          .map((p) => ({ id: p.id, deathChapterNo: p.deathChapterNo }));
      })
    },
    personaMention: {
      findMany: vi.fn(
        async ({
          where
        }: {
          where: {
            bookId             : string;
            promotedPersonaId  : string;
            chapterNo          : { gt: number };
            identityClaim      : { in: string[] };
            narrativeRegionType: string;
          };
        }) => {
          return state.mentions
            .filter(
              (m) =>
                m.bookId === where.bookId &&
                m.promotedPersonaId === where.promotedPersonaId &&
                m.chapterNo > where.chapterNo.gt &&
                where.identityClaim.in.includes(m.identityClaim) &&
                m.narrativeRegionType === where.narrativeRegionType
            )
            .sort((a, b) => a.chapterNo - b.chapterNo);
        }
      )
    },
    mergeSuggestion: {
      findMany: vi.fn(
        async ({
          where
        }: {
          where: {
            bookId         : string;
            sourcePersonaId: string;
            source         : string;
            status         : string;
          };
        }) => {
          return state.suggestions
            .filter(
              (s) =>
                s.bookId === where.bookId &&
                s.sourcePersonaId === where.sourcePersonaId &&
                s.source === where.source &&
                s.status === where.status
            )
            .map((s) => ({ id: s.id, evidenceRefs: s.evidenceRefs }));
        }
      ),
      create: vi.fn(async ({ data }: { data: Omit<SuggestionRow, "id"> }) => {
        const row: SuggestionRow = {
          id: `sugg-${state.createdRows.length + 1}`,
          ...data
        };
        state.createdRows.push(row);
        state.suggestions.push(row);
        return { id: row.id };
      })
    }
  } as unknown as TemporalB5PrismaClient;

  return { prisma, state };
}

const BOOK_ID = "book-1";

// ── Fixture 构造器 ────────────────────────────────────────────────────

function makeMention(overrides: Partial<MentionRow>): MentionRow {
  return {
    id                 : overrides.id ?? `m-${Math.random().toString(36).slice(2, 8)}`,
    bookId             : overrides.bookId ?? BOOK_ID,
    promotedPersonaId  : overrides.promotedPersonaId ?? null,
    chapterNo          : overrides.chapterNo ?? 1,
    surfaceForm        : overrides.surfaceForm ?? "某人",
    rawSpan            : overrides.rawSpan ?? "某人出场",
    identityClaim      : overrides.identityClaim ?? "SELF",
    narrativeRegionType: overrides.narrativeRegionType ?? "NARRATIVE"
  };
}

// ── 测试用例 ─────────────────────────────────────────────────────────

describe("TemporalConsistencyChecker.check", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("用例 01 · persona 死于第 10 回，第 12 回 SELF/NARRATIVE → 产出 1 条 IMPERSONATION_CANDIDATE", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ id: "m-a", promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "SELF" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);

    expect(result.suggestionsCreated).toBe(1);
    expect(result.suggestionsSkipped).toBe(0);
    expect(state.createdRows).toHaveLength(1);
    const created = state.createdRows[0];
    expect(created.sourcePersonaId).toBe("p-1");
    expect(created.status).toBe("PENDING");
    expect(created.source).toBe("STAGE_B5_TEMPORAL");
    expect(created.confidence).toBe(0.9);
    expect(created.targetPersonaId).toBe("p-1"); // 自指哨兵
    const refs = created.evidenceRefs as { kind: string; subKind: string; deathChapterNo: number };
    expect(refs.kind).toBe("IMPERSONATION_CANDIDATE");
    expect(refs.subKind).toBe("POST_DEATH_ACTION");
    expect(refs.deathChapterNo).toBe(10);
  });

  it("用例 02 · 第 12 回 QUOTED → 不产出（被别人提及不算死后行动）", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "QUOTED" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
    expect(state.createdRows).toHaveLength(0);
    expect(result.reports[0].action).toBe("none");
  });

  it("用例 03 · 第 12 回 IMPERSONATING/NARRATIVE → 产出（冒名者也算）", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "IMPERSONATING" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(1);
    expect(state.createdRows[0].sourcePersonaId).toBe("p-1");
  });

  it("用例 04 · deathChapterNo=null → persona 跳过，不出现在 reports", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: null, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 5, identityClaim: "SELF" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.personasScanned).toBe(0);
    expect(result.suggestionsCreated).toBe(0);
    expect(result.reports).toHaveLength(0);
    expect(state.createdRows).toHaveLength(0);
  });

  it("用例 05 · 幂等：同 persona 已有 STAGE_B5_TEMPORAL+PENDING+IMPERSONATION_CANDIDATE → skipped_existing", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "SELF" })
      ],
      suggestions: [
        {
          id             : "sugg-existing",
          bookId         : BOOK_ID,
          sourcePersonaId: "p-1",
          targetPersonaId: "p-1",
          status         : "PENDING",
          source         : "STAGE_B5_TEMPORAL",
          confidence     : 0.9,
          reason         : "prev",
          evidenceRefs   : { kind: "IMPERSONATION_CANDIDATE" }
        }
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
    expect(result.suggestionsSkipped).toBe(1);
    expect(state.createdRows).toHaveLength(0);
    expect(result.reports[0].action).toBe("skipped_existing");
    expect(result.reports[0].suggestionId).toBe("sugg-existing");
  });

  it("用例 06 · evidenceRefs.postDeathMentions 包含 mentionId/chapterNo/surfaceForm/rawSpan 完整字段", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({
          id               : "m-specific",
          promotedPersonaId: "p-1",
          chapterNo        : 11,
          identityClaim    : "SELF",
          surfaceForm      : "牛布衣",
          rawSpan          : "牛布衣作诗一首"
        })
      ]
    });
    await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    const refs = state.createdRows[0].evidenceRefs as {
      postDeathMentions: Array<{
        mentionId  : string;
        chapterNo  : number;
        surfaceForm: string;
        rawSpan    : string;
      }>;
    };
    expect(refs.postDeathMentions).toHaveLength(1);
    expect(refs.postDeathMentions[0]).toEqual({
      mentionId          : "m-specific",
      chapterNo          : 11,
      surfaceForm        : "牛布衣",
      rawSpan            : "牛布衣作诗一首",
      identityClaim      : "SELF",
      narrativeRegionType: "NARRATIVE"
    });
  });

  it("用例 07 · 多个 post-death chapters → 全部收集，按 chapterNo asc 排序", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ id: "m-c", promotedPersonaId: "p-1", chapterNo: 15, identityClaim: "SELF" }),
        makeMention({ id: "m-a", promotedPersonaId: "p-1", chapterNo: 11, identityClaim: "SELF" }),
        makeMention({ id: "m-b", promotedPersonaId: "p-1", chapterNo: 13, identityClaim: "IMPERSONATING" })
      ]
    });
    await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    const refs = state.createdRows[0].evidenceRefs as {
      postDeathMentions: Array<{ mentionId: string; chapterNo: number }>;
    };
    expect(refs.postDeathMentions.map((m) => m.mentionId)).toEqual(["m-a", "m-b", "m-c"]);
    expect(refs.postDeathMentions.map((m) => m.chapterNo)).toEqual([11, 13, 15]);
  });

  it("用例 08 · REPORTED/HISTORICAL lens post-death → 不触发（追忆/典故合法）", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "REPORTED" }),
        makeMention({ promotedPersonaId: "p-1", chapterNo: 13, identityClaim: "HISTORICAL" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
    expect(state.createdRows).toHaveLength(0);
    expect(result.reports[0].action).toBe("none");
  });

  it("用例 09 · chapterNo == deathChapterNo → 不触发（death 当章尾声行动合理）", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 10, identityClaim: "SELF" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
    expect(state.createdRows).toHaveLength(0);
  });

  it("用例 10 · chapterNo < deathChapterNo → 不触发", async () => {
    const { prisma } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 5, identityClaim: "SELF" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
  });

  it("用例 11 · 非 NARRATIVE 区段（POEM/DIALOGUE/COMMENTARY）→ 不触发", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "SELF", narrativeRegionType: "POEM" }),
        makeMention({ promotedPersonaId: "p-1", chapterNo: 13, identityClaim: "SELF", narrativeRegionType: "DIALOGUE" }),
        makeMention({ promotedPersonaId: "p-1", chapterNo: 14, identityClaim: "SELF", narrativeRegionType: "COMMENTARY" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
    expect(state.createdRows).toHaveLength(0);
  });

  it("用例 12 · 多 persona 混合：仅命中者写入，未命中者 action=none", async () => {
    const { prisma, state } = mockPrisma({
      personas: [
        { id: "p-alive", deathChapterNo: 10, bookId: BOOK_ID },
        { id: "p-dead",  deathChapterNo: 10, bookId: BOOK_ID }
      ],
      mentions: [
        makeMention({ promotedPersonaId: "p-alive", chapterNo: 5,  identityClaim: "SELF" }),
        makeMention({ promotedPersonaId: "p-dead",  chapterNo: 12, identityClaim: "SELF" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.personasScanned).toBe(2);
    expect(result.suggestionsCreated).toBe(1);
    expect(state.createdRows).toHaveLength(1);
    expect(state.createdRows[0].sourcePersonaId).toBe("p-dead");
    const actions = new Map(result.reports.map((r) => [r.personaId, r.action]));
    expect(actions.get("p-alive")).toBe("none");
    expect(actions.get("p-dead")).toBe("created");
  });

  it("用例 13 · 本书无 deathChapterNo 非空 persona → 返回空结果，0 写入", async () => {
    const { prisma, state } = mockPrisma({ personas: [], mentions: [] });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.personasScanned).toBe(0);
    expect(result.suggestionsCreated).toBe(0);
    expect(result.suggestionsSkipped).toBe(0);
    expect(result.reports).toEqual([]);
    expect(state.createdRows).toHaveLength(0);
  });

  it("用例 14 · reason 字段含 POST_DEATH_ACTION 分类标记", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 20, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 22, identityClaim: "SELF" })
      ]
    });
    await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(state.createdRows[0].reason).toMatch(/POST_DEATH_ACTION/);
    expect(state.createdRows[0].reason).toContain("第 20 回");
  });

  it("用例 15 · 非 STAGE_B5_TEMPORAL 的历史 PENDING（如 STAGE_B_AUTO）不阻塞本次写入", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "SELF" })
      ],
      suggestions: [
        {
          id             : "sugg-other",
          bookId         : BOOK_ID,
          sourcePersonaId: "p-1",
          targetPersonaId: "p-other",
          status         : "PENDING",
          source         : "STAGE_B_AUTO", // 不同来源
          confidence     : 0.9,
          reason         : "merge candidate",
          evidenceRefs   : { tier: 2 }
        }
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(1);
    expect(state.createdRows).toHaveLength(1);
  });

  it("用例 16 · 已 RESOLVED 状态的历史建议不阻塞新增（仅 PENDING 才算幂等目标）", async () => {
    const { prisma, state } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "SELF" })
      ],
      suggestions: [
        {
          id             : "sugg-resolved",
          bookId         : BOOK_ID,
          sourcePersonaId: "p-1",
          targetPersonaId: "p-1",
          status         : "ACCEPTED", // 已审
          source         : "STAGE_B5_TEMPORAL",
          confidence     : 0.9,
          reason         : "previously accepted",
          evidenceRefs   : { kind: "IMPERSONATION_CANDIDATE" }
        }
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(1);
    expect(state.createdRows).toHaveLength(1);
  });

  it("用例 17 · UNSURE identityClaim post-death → 不触发（只收 SELF/IMPERSONATING）", async () => {
    const { prisma } = mockPrisma({
      personas: [{ id: "p-1", deathChapterNo: 10, bookId: BOOK_ID }],
      mentions: [
        makeMention({ promotedPersonaId: "p-1", chapterNo: 12, identityClaim: "UNSURE" })
      ]
    });
    const result = await new TemporalConsistencyChecker(prisma).check(BOOK_ID);
    expect(result.suggestionsCreated).toBe(0);
  });
});
