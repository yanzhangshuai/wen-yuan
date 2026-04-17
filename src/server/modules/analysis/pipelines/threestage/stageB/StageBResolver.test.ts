/**
 * 被测对象：`StageBResolver.resolve(bookId)` —— 三阶段架构 Stage B 全书仲裁器。
 *
 * 测试分类（≥ 25 条）：
 *   通道①/②/③ 候选组构建（各 ≥3 用例）
 *   AliasEntry 空/抛错降级（2 用例）
 *   §0-9 充要条件命中 → 合并（3 用例）
 *   §0-9 不满足 → suggestion 不合并（3 用例）
 *   §0-7 CONFIRMED 分支 + §0-4 LOW 加严（各 2-3 用例）
 *   B.5 IMPERSONATION_CANDIDATE 消费：可推断 / 不可推断（3 用例）
 *   幂等（2 用例）
 *   parseStageBResponse 兜底（1 用例）
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  StageBResolver,
  type StageBPrismaClient,
  parseStageBResponse
} from "@/server/modules/analysis/pipelines/threestage/stageB/StageBResolver";
import type { AiProviderClient, AiGenerateResult } from "@/server/providers/ai";
import type { BookTypeCode } from "@/generated/prisma/client";

// Hoisted mocks for Prompt/FewShots. Required by Vitest hoisting semantics.
const hoisted = vi.hoisted(() => ({
  resolvePromptTemplate: vi.fn(),
  getFewShots          : vi.fn()
}));

vi.mock("@/server/modules/knowledge", () => ({
  resolvePromptTemplate: hoisted.resolvePromptTemplate
}));

vi.mock("@/server/modules/analysis/prompts/resolveBookTypeFewShots", () => ({
  getFewShots: hoisted.getFewShots
}));

// ─────────────────────────── Mock prisma ───────────────────────────

interface BookRow {
  id      : string;
  title   : string;
  typeCode: BookTypeCode;
}
interface MentionRow {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  chapterNo          : number;
  surfaceForm        : string;
  suspectedResolvesTo: string | null;
  aliasTypeHint      : string;
  identityClaim      : string;
  narrativeRegionType: string;
  actionVerb         : string | null;
  rawSpan            : string;
  confidence         : number;
  promotedPersonaId  : string | null;
}
interface PersonaRow {
  id                    : string;
  name                  : string;
  status                : string;
  mentionCount          : number;
  distinctChapters      : number;
  aliases               : string[];
  preprocessorConfidence: string | null;
}
interface PreprocessRow {
  chapterId : string;
  confidence: string;
}
interface BioRow {
  personaId          : string;
  narrativeLens      : string;
  narrativeRegionType: string;
}
interface AliasEntryRow {
  canonicalName: string;
  aliases      : string[];
  packScope    : "GLOBAL" | "BOOK";
  bookId       : string | null;
  isActive     : boolean;
  reviewStatus : "VERIFIED" | "PENDING";
}
interface SuggestionRow {
  id             : string;
  bookId         : string;
  sourcePersonaId: string;
  targetPersonaId: string;
  reason         : string;
  confidence     : number;
  status         : string;
  source         : string;
  evidenceRefs   : unknown;
}

interface State {
  books          : BookRow[];
  mentions       : MentionRow[];
  personas       : PersonaRow[];
  preprocess     : PreprocessRow[];
  biographies    : BioRow[];
  aliasEntries   : AliasEntryRow[];
  suggestions    : SuggestionRow[];
  personaSeq     : number;
  suggestionSeq  : number;
  /** 若 true，则 aliasEntry.findMany 抛错，用于测降级 */
  aliasEntryThrow: boolean;
}

function makeState(init: Partial<State>): State {
  return {
    books          : init.books        ?? [],
    mentions       : init.mentions     ?? [],
    personas       : init.personas     ?? [],
    preprocess     : init.preprocess   ?? [],
    biographies    : init.biographies  ?? [],
    aliasEntries   : init.aliasEntries ?? [],
    suggestions    : init.suggestions  ?? [],
    personaSeq     : 0,
    suggestionSeq  : 0,
    aliasEntryThrow: init.aliasEntryThrow ?? false
  };
}

function makePrisma(state: State): StageBPrismaClient {
  // Minimal prisma mock: implement the handful of branches StageBResolver actually uses.
  // Intentionally not a full Prisma emulator; only shapes referenced in code path.

  // Transaction simply runs the callback with the same prisma (mutations via ref).
  const $transaction = (vi.fn(async (fnOrArr: unknown) => {
    if (typeof fnOrArr === "function") return (fnOrArr as (tx: unknown) => Promise<unknown>)(prismaObj);
    return Promise.all(fnOrArr as unknown[]);
  })) as unknown as StageBPrismaClient["$transaction"];

  const prismaObj = {
    book: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const b = state.books.find((r) => r.id === where.id);
        return b ? { id: b.id, title: b.title, typeCode: b.typeCode } : null;
      })
    },
    personaMention: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return filterMentions(state.mentions, where).map((m) => ({ ...m }));
      }),
      updateMany: vi.fn(async ({ where, data }: { where: { id: { in: string[] } }; data: Partial<MentionRow> }) => {
        let count = 0;
        for (const m of state.mentions) {
          if (where.id.in.includes(m.id)) {
            Object.assign(m, data);
            count++;
          }
        }
        return { count };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<MentionRow> }) => {
        const m = state.mentions.find((x) => x.id === where.id);
        if (m) Object.assign(m, data);
        return m;
      })
    },
    persona: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return state.personas.find((p) => p.id === where.id) ?? null;
      }),
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        return state.personas.filter((p) => where.id.in.includes(p.id));
      }),
      create: vi.fn(async ({ data }: { data: Partial<PersonaRow> }) => {
        state.personaSeq += 1;
        const row: PersonaRow = {
          id                    : `p-${state.personaSeq}`,
          name                  : data.name ?? "",
          status                : data.status ?? "CANDIDATE",
          mentionCount          : data.mentionCount ?? 0,
          distinctChapters      : data.distinctChapters ?? 0,
          aliases               : data.aliases ?? [],
          preprocessorConfidence: data.preprocessorConfidence ?? "HIGH"
        };
        state.personas.push(row);
        return row;
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<PersonaRow> }) => {
        const p = state.personas.find((x) => x.id === where.id);
        if (p) Object.assign(p, data);
        return p;
      })
    },
    mergeSuggestion: {
      findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
        return state.suggestions.filter((s) => {
          if (where.bookId && s.bookId !== where.bookId) return false;
          if (where.source && s.source !== where.source) return false;
          if (where.status && s.status !== where.status) return false;
          return true;
        });
      }),
      create: vi.fn(async ({ data }: { data: Omit<SuggestionRow, "id"> }) => {
        state.suggestionSeq += 1;
        const row: SuggestionRow = { id: `sugg-${state.suggestionSeq}`, ...data };
        state.suggestions.push(row);
        return { id: row.id };
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SuggestionRow> }) => {
        const s = state.suggestions.find((x) => x.id === where.id);
        if (s) Object.assign(s, data);
        return s;
      })
    },
    aliasEntry: {
      findMany: vi.fn(async ({ where }: { where: { reviewStatus: string; pack: { isActive: boolean; OR: Array<{ scope?: string; bookPacks?: { some: { bookId: string } } }> } } }) => {
        if (state.aliasEntryThrow) throw new Error("alias_entries table missing");
        const bookIdFilter = where.pack.OR.find((c) => c.bookPacks !== undefined)?.bookPacks?.some.bookId;
        return state.aliasEntries
          .filter((e) => e.reviewStatus === where.reviewStatus)
          .filter((e) => e.isActive === where.pack.isActive)
          .filter((e) => e.packScope === "GLOBAL" || e.bookId === bookIdFilter)
          .map((e) => ({ canonicalName: e.canonicalName, aliases: e.aliases }));
      })
    },
    chapterPreprocessResult: {
      findMany: vi.fn(async ({ where }: { where: { chapterId: { in: string[] } } }) => {
        return state.preprocess.filter((p) => where.chapterId.in.includes(p.chapterId));
      })
    },
    biographyRecord: {
      count: vi.fn(async ({ where }: { where: { personaId: string; narrativeLens: { in: string[] }; narrativeRegionType: string } }) => {
        return state.biographies.filter(
          (b) =>
            b.personaId === where.personaId &&
            where.narrativeLens.in.includes(b.narrativeLens) &&
            b.narrativeRegionType === where.narrativeRegionType
        ).length;
      })
    },
    $transaction
  } as unknown as StageBPrismaClient;

  return prismaObj;
}

function filterMentions(all: MentionRow[], where: Record<string, unknown>): MentionRow[] {
  return all.filter((m) => {
    if (where.bookId && m.bookId !== where.bookId) return false;

    const chNo = where.chapterNo as { in?: number[]; gt?: number } | undefined;
    if (chNo !== undefined) {
      if (chNo.in !== undefined && !chNo.in.includes(m.chapterNo)) return false;
      if (chNo.gt !== undefined && m.chapterNo <= chNo.gt) return false;
    }
    const pid = where.promotedPersonaId as { not?: null | string } | string | null | undefined;
    if (pid !== undefined) {
      if (pid === null && m.promotedPersonaId !== null) return false;
      if (typeof pid === "object" && pid !== null && "not" in pid) {
        if (pid.not === null && m.promotedPersonaId === null) return false;
        if (typeof pid.not === "string" && m.promotedPersonaId === pid.not) return false;
      }
    }
    const notBlock = where.NOT as { promotedPersonaId?: string } | undefined;
    if (notBlock?.promotedPersonaId !== undefined) {
      if (m.promotedPersonaId === notBlock.promotedPersonaId) return false;
    }
    const orBlock = where.OR as Array<{ identityClaim?: string; surfaceForm?: { in: string[] } }> | undefined;
    if (Array.isArray(orBlock)) {
      const ok = orBlock.some((c) => {
        if (c.identityClaim !== undefined && m.identityClaim === c.identityClaim) return true;
        if (c.surfaceForm?.in && c.surfaceForm.in.includes(m.surfaceForm)) return true;
        return false;
      });
      if (!ok) return false;
    }
    return true;
  });
}

// ─────────────────────────── AI mock ───────────────────────────

function mockAi(decisionByGroup: Array<{ decision: string; confidence: number; rationale?: string }>): AiProviderClient {
  let i = 0;
  const generateJson = vi.fn(async (): Promise<AiGenerateResult> => {
    const d = decisionByGroup[i] ?? { decision: "UNSURE", confidence: 0 };
    i++;
    return {
      content: JSON.stringify([{ groupId: i, decision: d.decision, confidence: d.confidence, rationale: d.rationale ?? "" }]),
      usage  : null
    };
  });
  return { generateJson };
}

function setupPromptMock(): void {
  hoisted.resolvePromptTemplate.mockResolvedValue({
    system   : "sys",
    user     : "user:{candidateGroups}|{bookTypeFewShots}",
    versionId: "v1",
    versionNo: 1,
    codeRef  : null
  });
  hoisted.getFewShots.mockResolvedValue("FS");
}

// ─────────────────────────── fixture helpers ───────────────────────────

const BOOK_ID = "book-1";

function mkBook(typeCode: BookTypeCode = "CLASSICAL_NOVEL"): BookRow {
  return { id: BOOK_ID, title: "儒林外史", typeCode };
}
function mkMention(overrides: Partial<MentionRow>): MentionRow {
  return {
    id                 : overrides.id ?? `m-${Math.random().toString(36).slice(2, 8)}`,
    bookId             : overrides.bookId ?? BOOK_ID,
    chapterId          : overrides.chapterId ?? `ch-${overrides.chapterNo ?? 1}`,
    chapterNo          : overrides.chapterNo ?? 1,
    surfaceForm        : overrides.surfaceForm ?? "某人",
    suspectedResolvesTo: overrides.suspectedResolvesTo ?? null,
    aliasTypeHint      : overrides.aliasTypeHint ?? "NAMED",
    identityClaim      : overrides.identityClaim ?? "SELF",
    narrativeRegionType: overrides.narrativeRegionType ?? "NARRATIVE",
    actionVerb         : overrides.actionVerb ?? null,
    rawSpan            : overrides.rawSpan ?? "某人做了某事",
    confidence         : overrides.confidence ?? 0.9,
    promotedPersonaId  : overrides.promotedPersonaId ?? null
  };
}

// ─────────────────────────── 用例 ───────────────────────────

describe("StageBResolver.resolve", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPromptMock();
  });

  // ── 通道 ① EXACT_SURFACE ──
  it("用例 01 · 通道① 精确同名 + 全 SELF + 2 章 → MERGE 命中充要 → CONFIRMED", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "m1", chapterNo: 1, surfaceForm: "王冕" }),
        mkMention({ id: "m2", chapterNo: 2, surfaceForm: "王冕" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });

    expect(res.merges).toHaveLength(1);
    expect(res.merges[0].canonicalName).toBe("王冕");
    expect(res.merges[0].mentionIds).toEqual(expect.arrayContaining(["m1", "m2"]));
    expect(res.merges[0].status).toBe("CONFIRMED");
    expect(res.llmInvocations).toBe(1);
  });

  it("用例 02 · 通道① 精确同名单章 → 不满足充要 → 写 suggestion", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "m1", chapterNo: 1, surfaceForm: "张三" }),
        mkMention({ id: "m2", chapterNo: 1, surfaceForm: "张三" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });

    expect(res.merges.length).toBeGreaterThanOrEqual(1);
    expect(res.suggestions).toHaveLength(1);
    expect(res.suggestions[0].confidence).toBeCloseTo(0.9);
  });

  it("用例 03 · 通道① 单 mention 无需 LLM → 落 CANDIDATE", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [mkMention({ id: "m1", chapterNo: 1, surfaceForm: "李四" })]
    });
    const res = await new StageBResolver(
      mockAi([]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.llmInvocations).toBe(0);
    expect(res.merges).toHaveLength(1);
    expect(res.merges[0].status).toBe("CANDIDATE");
  });

  // ── 通道 ② SUSPECTED_RESOLVES_TO ──
  it("用例 04 · 通道② COURTESY_NAME 指向 NAMED 锚点 → 归入同组", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "范进", aliasTypeHint: "NAMED" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "范老爷", aliasTypeHint: "NICKNAME", suspectedResolvesTo: "范进" })
      ],
      aliasEntries: []
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });

    expect(res.candidateGroupsTotal).toBe(1);
    // 不同 surface 但被通道② 联通；无规则预合并 → 未满足充要 → suggestion
    expect(res.suggestions).toHaveLength(1);
  });

  it("用例 05 · 通道② suspectedResolvesTo 指向不存在锚点 → 不联通", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "李五", aliasTypeHint: "NAMED" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "老李", aliasTypeHint: "NICKNAME", suspectedResolvesTo: "李某某不存在" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    // 两 mention 独立成组
    expect(res.candidateGroupsTotal).toBe(2);
    expect(res.llmInvocations).toBe(0);
  });

  it("用例 06 · 通道② 多个 COURTESY_NAME 指向同一 NAMED → 联通为一组", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "杜少卿", aliasTypeHint: "NAMED" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "杜兄", aliasTypeHint: "NICKNAME", suspectedResolvesTo: "杜少卿" }),
        mkMention({ id: "c", chapterNo: 3, surfaceForm: "杜公子", aliasTypeHint: "NICKNAME", suspectedResolvesTo: "杜少卿" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.candidateGroupsTotal).toBe(1);
    expect(res.llmInvocations).toBe(1);
  });

  // ── 通道 ③ ALIAS_ENTRY ──
  it("用例 07 · 通道③ AliasEntry 命中 + 2 章 → MERGE 充要成立", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "牛浦", aliasTypeHint: "NAMED" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "牛浦郎", aliasTypeHint: "NAMED" })
      ],
      aliasEntries: [
        { canonicalName: "牛浦", aliases: ["牛浦郎", "浦郎"], packScope: "GLOBAL", bookId: null, isActive: true, reviewStatus: "VERIFIED" }
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });

    expect(res.candidateGroupsTotal).toBe(1);
    expect(res.merges).toHaveLength(1);
    expect(res.merges[0].canonicalName).toBe("牛浦");
    expect(res.merges[0].aliasesAdded).toContain("牛浦郎");
    expect(res.aliasEntryDegraded).toBe(false);
  });

  it("用例 08 · 通道③ AliasEntry BOOK scope 限定 bookId → 仅对匹配书生效", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "X", aliasTypeHint: "NAMED" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "Y", aliasTypeHint: "NAMED" })
      ],
      aliasEntries: [
        { canonicalName: "X", aliases: ["Y"], packScope: "BOOK", bookId: BOOK_ID, isActive: true, reviewStatus: "VERIFIED" }
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges).toHaveLength(1);
    expect(res.merges[0].canonicalName).toBe("X");
  });

  it("用例 09 · 通道③ AliasEntry reviewStatus=PENDING → 不生效", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "P", aliasTypeHint: "NAMED" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "Q", aliasTypeHint: "NAMED" })
      ],
      aliasEntries: [
        { canonicalName: "P", aliases: ["Q"], packScope: "GLOBAL", bookId: null, isActive: true, reviewStatus: "PENDING" }
      ]
    });
    const res = await new StageBResolver(
      mockAi([]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.candidateGroupsTotal).toBe(2);
    expect(res.aliasEntryDegraded).toBe(true);
  });

  // ── AliasEntry 空/抛错 降级 ──
  it("用例 10 · AliasEntry 结果为空 → aliasEntryDegraded=true 但不报错", async () => {
    const state = makeState({
      books       : [mkBook()],
      mentions    : [mkMention({ id: "a", chapterNo: 1, surfaceForm: "Alpha" })],
      aliasEntries: []
    });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.aliasEntryDegraded).toBe(true);
  });

  it("用例 11 · AliasEntry 查询抛错 → 降级不中断", async () => {
    const state = makeState({
      books          : [mkBook()],
      mentions       : [mkMention({ id: "a", chapterNo: 1, surfaceForm: "Beta" })],
      aliasEntryThrow: true
    });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.aliasEntryDegraded).toBe(true);
    expect(res.merges).toHaveLength(1);
  });

  // ── §0-9 充要条件 MERGE ──
  it("用例 12 · §0-9 充分：2 章 + rulePreMerge(同名全 SELF) → MERGE", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "周进" }),
        mkMention({ id: "b", chapterNo: 3, surfaceForm: "周进" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges).toHaveLength(1);
    expect(res.suggestions).toHaveLength(0);
  });

  it("用例 13 · §0-9 充分：2 章 + AliasEntry 命中 → MERGE", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 5, surfaceForm: "杜慎卿" }),
        mkMention({ id: "b", chapterNo: 6, surfaceForm: "杜直阁" })
      ],
      aliasEntries: [
        { canonicalName: "杜慎卿", aliases: ["杜直阁"], packScope: "GLOBAL", bookId: null, isActive: true, reviewStatus: "VERIFIED" }
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges).toHaveLength(1);
    expect(res.merges[0].canonicalName).toBe("杜慎卿");
  });

  it("用例 14 · §0-9 必要不满足：confidence<floor(0.85) → 不合并", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "甲" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "甲" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.7 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges.filter((m) => m.mentionIds.length === 2)).toHaveLength(0);
    expect(res.suggestions).toHaveLength(1);
  });

  // ── §0-9 不满足充分 → suggestion ──
  it("用例 15 · 仅 1 章证据 + MERGE LLM → 不合并，写 suggestion", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "牛浦" }),
        mkMention({ id: "b", chapterNo: 1, surfaceForm: "牛浦郎" })
      ],
      aliasEntries: [
        { canonicalName: "牛浦", aliases: ["牛浦郎"], packScope: "GLOBAL", bookId: null, isActive: true, reviewStatus: "VERIFIED" }
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.suggestions).toHaveLength(1);
    // 两 mention 拆为独立 singleton persona
    expect(res.merges).toHaveLength(2);
  });

  it("用例 16 · IMPERSONATING 混入 → rulePreMergeHit=false → 不满足充分", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "牛布衣", identityClaim: "SELF" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "牛布衣", identityClaim: "IMPERSONATING" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    // 同 surface 但 IMPERSONATING 破坏 rulePreMerge → suggestion
    expect(res.suggestions).toHaveLength(1);
  });

  it("用例 17 · LLM=UNSURE → 视为 suggestion，不合并", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "Z" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "Z" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "UNSURE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.suggestions).toHaveLength(1);
  });

  // ── §0-7 CONFIRMED 门槛 ──
  it("用例 18 · §0-7 满足 distinctChapters≥2 + mentionCount≥2 → CONFIRMED", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "马纯上" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "马纯上" }),
        mkMention({ id: "c", chapterNo: 3, surfaceForm: "马纯上" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges[0].status).toBe("CONFIRMED");
  });

  it("用例 19 · §0-7 未满足 (单 mention) → CANDIDATE", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [mkMention({ id: "a", chapterNo: 1, surfaceForm: "路人甲" })]
    });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.merges[0].status).toBe("CANDIDATE");
  });

  it("用例 20 · §0-7 未满足 (单章多 mention) → CANDIDATE", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "Q" }),
        mkMention({ id: "b", chapterNo: 1, surfaceForm: "Q" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    // 单章 distinctChapters=1 → CANDIDATE；且不满足充分 → suggestion
    const merged = res.merges.find((m) => m.mentionIds.length === 2);
    expect(merged).toBeUndefined();
    expect(res.merges.every((m) => m.status === "CANDIDATE")).toBe(true);
  });

  // ── §0-4 LOW 加严 ──
  it("用例 21 · §0-4 LOW 章节 → 阈值 +1 → 2 章 2 mention 仍不满足 → CANDIDATE", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterId: "ch-1", chapterNo: 1, surfaceForm: "W" }),
        mkMention({ id: "b", chapterId: "ch-2", chapterNo: 2, surfaceForm: "W" })
      ],
      preprocess: [{ chapterId: "ch-1", confidence: "LOW" }]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges[0].hasLowChapter).toBe(true);
    expect(res.merges[0].status).toBe("CANDIDATE");
  });

  it("用例 22 · §0-4 LOW 章节 + 3 章 3 mention → 满足加严后阈值 → CONFIRMED", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterId: "ch-1", chapterNo: 1, surfaceForm: "W" }),
        mkMention({ id: "b", chapterId: "ch-2", chapterNo: 2, surfaceForm: "W" }),
        mkMention({ id: "c", chapterId: "ch-3", chapterNo: 3, surfaceForm: "W" })
      ],
      preprocess: [{ chapterId: "ch-1", confidence: "LOW" }]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges[0].hasLowChapter).toBe(true);
    expect(res.merges[0].status).toBe("CONFIRMED");
  });

  // ── B.5 IMPERSONATION_CANDIDATE 消费 ──
  it("用例 23 · B.5 消费：IMPERSONATING mention 同章唯一 → 推断 targetPersonaId", async () => {
    const state = makeState({
      books   : [mkBook()],
      personas: [
        { id: "dead-1", name: "牛布衣", status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" },
        { id: "imp-1",  name: "牛浦",   status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" }
      ],
      mentions: [
        mkMention({ id: "impm", chapterNo: 22, surfaceForm: "牛布衣", identityClaim: "IMPERSONATING", promotedPersonaId: "imp-1" })
      ],
      suggestions: [{
        id             : "sugg-b5",
        bookId         : BOOK_ID,
        sourcePersonaId: "dead-1",
        targetPersonaId: "dead-1",
        reason         : "post death",
        confidence     : 0.9,
        status         : "PENDING",
        source         : "STAGE_B5_TEMPORAL",
        evidenceRefs   : {
          kind             : "IMPERSONATION_CANDIDATE",
          postDeathMentions: [{ chapterNo: 22, surfaceForm: "牛布衣" }]
        }
      }]
    });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.b5Consumed).toHaveLength(1);
    expect(res.b5Consumed[0].newTargetId).toBe("imp-1");
    expect(res.b5Consumed[0].status).toBe("PENDING");
    expect(state.suggestions[0].targetPersonaId).toBe("imp-1");
  });

  it("用例 24 · B.5 消费：按同 surfaceForm 推断冒名者", async () => {
    const state = makeState({
      books   : [mkBook()],
      personas: [
        { id: "dead-1", name: "牛布衣", status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" },
        { id: "imp-9",  name: "假牛布衣", status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" }
      ],
      mentions: [
        // 同章节同 surfaceForm 但 promotedPersonaId 是另一个 persona
        mkMention({ id: "x", chapterNo: 22, surfaceForm: "牛布衣", identityClaim: "SELF", promotedPersonaId: "imp-9" })
      ],
      suggestions: [{
        id             : "sugg-b5",
        bookId         : BOOK_ID,
        sourcePersonaId: "dead-1",
        targetPersonaId: "dead-1",
        reason         : "post death",
        confidence     : 0.9,
        status         : "PENDING",
        source         : "STAGE_B5_TEMPORAL",
        evidenceRefs   : { kind: "IMPERSONATION_CANDIDATE", postDeathMentions: [{ chapterNo: 22, surfaceForm: "牛布衣" }] }
      }]
    });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.b5Consumed[0].newTargetId).toBe("imp-9");
  });

  it("用例 25 · B.5 消费：多候选 → NEEDS_HUMAN_REVIEW", async () => {
    const state = makeState({
      books   : [mkBook()],
      personas: [
        { id: "dead-1", name: "牛布衣", status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" },
        { id: "imp-1",  name: "甲", status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" },
        { id: "imp-2",  name: "乙", status: "CONFIRMED", mentionCount: 0, distinctChapters: 0, aliases: [], preprocessorConfidence: "HIGH" }
      ],
      mentions: [
        mkMention({ id: "x", chapterNo: 22, surfaceForm: "牛布衣", identityClaim: "IMPERSONATING", promotedPersonaId: "imp-1" }),
        mkMention({ id: "y", chapterNo: 22, surfaceForm: "牛布衣", identityClaim: "IMPERSONATING", promotedPersonaId: "imp-2" })
      ],
      suggestions: [{
        id             : "sugg-b5",
        bookId         : BOOK_ID,
        sourcePersonaId: "dead-1",
        targetPersonaId: "dead-1",
        reason         : "post death",
        confidence     : 0.9,
        status         : "PENDING",
        source         : "STAGE_B5_TEMPORAL",
        evidenceRefs   : { kind: "IMPERSONATION_CANDIDATE", postDeathMentions: [{ chapterNo: 22, surfaceForm: "牛布衣" }] }
      }]
    });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.b5Consumed[0].status).toBe("NEEDS_HUMAN_REVIEW");
    expect(state.suggestions[0].status).toBe("NEEDS_HUMAN_REVIEW");
  });

  // ── 幂等 ──
  it("用例 26 · 幂等：所有 mention 已 promoted 到 CONFIRMED → 跳过该组", async () => {
    const state = makeState({
      books   : [mkBook()],
      personas: [
        { id: "p-existing", name: "王冕", status: "CONFIRMED", mentionCount: 2, distinctChapters: 2, aliases: [], preprocessorConfidence: "HIGH" }
      ],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "王冕", promotedPersonaId: "p-existing" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "王冕", promotedPersonaId: "p-existing" })
      ]
    });
    const ai = mockAi([]);
    const res = await new StageBResolver(ai, makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.llmInvocations).toBe(0);
    expect(res.merges).toHaveLength(0);
  });

  it("用例 27 · 幂等：部分 promoted 但 CANDIDATE → 继续处理，复用已有 personaId", async () => {
    const state = makeState({
      books   : [mkBook()],
      personas: [
        { id: "p-cand", name: "王冕", status: "CANDIDATE", mentionCount: 1, distinctChapters: 1, aliases: [], preprocessorConfidence: "HIGH" }
      ],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "王冕", promotedPersonaId: "p-cand" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "王冕" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "MERGE", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.merges[0].personaId).toBe("p-cand");
    expect(res.merges[0].status).toBe("CONFIRMED");
  });

  // ── 其它分支 ──
  it("用例 28 · LLM SPLIT → 拆为独立 persona，不写 suggestion", async () => {
    const state = makeState({
      books   : [mkBook()],
      mentions: [
        mkMention({ id: "a", chapterNo: 1, surfaceForm: "A", suspectedResolvesTo: "B", aliasTypeHint: "NICKNAME" }),
        mkMention({ id: "b", chapterNo: 2, surfaceForm: "B", aliasTypeHint: "NAMED" })
      ]
    });
    const res = await new StageBResolver(
      mockAi([{ decision: "SPLIT", confidence: 0.9 }]),
      makePrisma(state)
    ).resolve({ bookId: BOOK_ID });
    expect(res.suggestions).toHaveLength(0);
    expect(res.merges).toHaveLength(2);
  });

  it("用例 29 · 无 mention → 返回空结果", async () => {
    const state = makeState({ books: [mkBook()], mentions: [] });
    const res = await new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: BOOK_ID });
    expect(res.candidateGroupsTotal).toBe(0);
    expect(res.merges).toHaveLength(0);
  });

  it("用例 30 · book 不存在 → 抛错", async () => {
    const state = makeState({ books: [] });
    await expect(
      new StageBResolver(mockAi([]), makePrisma(state)).resolve({ bookId: "no-such" })
    ).rejects.toThrow(/book not found/);
  });
});

// ─────────────────────────── parseStageBResponse 单测 ───────────────────────────

describe("parseStageBResponse", () => {
  it("畸形 JSON → UNSURE/0", () => {
    const d = parseStageBResponse("not-json", 1);
    expect(d.decision).toBe("UNSURE");
    expect(d.confidence).toBe(0);
  });

  it("顶层对象 {decisions:[...]} → 按 groupId 命中", () => {
    const raw = JSON.stringify({
      decisions: [
        { groupId: 1, decision: "SPLIT", confidence: 0.5 },
        { groupId: 2, decision: "MERGE", confidence: 0.9 }
      ]
    });
    const d = parseStageBResponse(raw, 2);
    expect(d.decision).toBe("MERGE");
    expect(d.confidence).toBeCloseTo(0.9);
  });

  it("confidence 边界 & 非法 decision → 夹紧/降级", () => {
    const raw = JSON.stringify([{ groupId: 1, decision: "WHO_KNOWS", confidence: 1.8 }]);
    const d = parseStageBResponse(raw, 1);
    expect(d.decision).toBe("UNSURE");
    expect(d.confidence).toBe(1);
  });
});
