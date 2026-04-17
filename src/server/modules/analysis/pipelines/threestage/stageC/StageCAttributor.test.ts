/**
 * 被测对象：Stage C `StageCAttributor` 主服务（端到端，mock AI + mock Prisma）。
 * 测试目标：
 *   - parseStageCResponse：标准 / 兜底 / 畸形 / 枚举降级
 *   - 区段硬约束综合触发（POEM / COMMENTARY / DIALOGUE 第三方 / DIALOGUE 引入句主语 / NARRATIVE）
 *   - §0-6 四条件过滤：rawSpan<15 / actionVerb 空 → isEffective=false（仍落库）
 *   - §0-2 双源死亡：仅 Stage 0 / 仅 Stage C / 两源一致 / 冲突以 Stage 0 为准
 *   - §0-14 反馈：LLM 指向本章未晋级 persona → 写 STAGE_C_FEEDBACK suggestion
 *   - 幂等：同 chapter 重跑 deleteMany + createMany
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  parseStageCResponse,
  StageCAttributionError,
  StageCAttributor
} from "@/server/modules/analysis/pipelines/threestage/stageC/StageCAttributor";
import type { StageCPrismaClient } from "@/server/modules/analysis/pipelines/threestage/stageC/StageCAttributor";
import { BIOGRAPHY_REGION_OVERRIDE_RULES } from "@/server/modules/analysis/pipelines/threestage/stageC/enforceBiographyRegionConstraint";

import type { AiGenerateResult, AiProviderClient } from "@/server/providers/ai";

// Hoisted mocks
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

// ── 基础 mock 工厂 ───────────────────────────────────────────────────

interface MentionSeed {
  id               : string;
  chapterId        : string;
  chapterNo        : number;
  surfaceForm      : string;
  aliasTypeHint    : string;
  identityClaim    : string;
  actionVerb       : string | null;
  rawSpan          : string;
  promotedPersonaId: string | null;
  bookId           : string;
}

interface PersonaSeed {
  id                     : string;
  name                   : string;
  aliases                : string[];
  deathChapterNo         : number | null;
  effectiveBiographyCount: number;
}

interface ChapterSeed {
  id     : string;
  no     : number;
  content: string;
}

interface BioSeed {
  id          : string;
  personaId   : string;
  chapterId   : string;
  chapterNo   : number;
  category    : string;
  isEffective : boolean;
  recordSource: string;
}

interface SuggestionSeed {
  id             : string;
  bookId         : string;
  sourcePersonaId: string;
  targetPersonaId: string;
  source         : string;
  status         : string;
  reason         : string;
  evidenceRefs   : unknown;
  confidence     : number;
}

interface TestState {
  book       : { id: string; title: string; typeCode: string };
  personas   : PersonaSeed[];
  chapters   : ChapterSeed[];
  mentions   : MentionSeed[];
  biographies: BioSeed[];
  suggestions: SuggestionSeed[];
  preprocess  : Array<{
    chapterId   : string;
    regions     : unknown;
    deathMarkers: unknown;
  }>;
}

function createState(partial?: Partial<TestState>): TestState {
  return {
    book       : { id: "book-1", title: "儒林外史", typeCode: "CLASSICAL_NOVEL" },
    personas   : [],
    chapters   : [],
    mentions   : [],
    biographies: [],
    suggestions: [],
    preprocess : [],
    ...partial
  };
}

function mockAiClient(responses: string[]): AiProviderClient & {
  generateJsonMock: ReturnType<typeof vi.fn>;
} {
  let idx = 0;
  const generateJsonMock = vi.fn(async (): Promise<AiGenerateResult> => {
    const content = responses[idx] ?? responses[responses.length - 1] ?? "{\"records\":[]}";
    idx += 1;
    return { content, usage: null };
  });
  return {
    generateJson: generateJsonMock,
    generateJsonMock
  };
}

function mockPrisma(state: TestState): StageCPrismaClient {
  const bioDeleteCalls: Array<{ chapterIds: string[] }> = [];
  const bioCreateCalls: Array<Array<Record<string, unknown>>> = [];
  let bioSeq = 0;

  const txBiographyRecord = {
    deleteMany: vi.fn(async ({ where }: { where: { chapterId: { in: string[] }; recordSource?: string } }) => {
      bioDeleteCalls.push({ chapterIds: where.chapterId.in });
      const before = state.biographies.length;
      state.biographies = state.biographies.filter(
        (b) => !(where.chapterId.in.includes(b.chapterId) && b.recordSource === (where.recordSource ?? "AI"))
      );
      return { count: before - state.biographies.length };
    }),
    createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
      bioCreateCalls.push(data);
      for (const d of data) {
        bioSeq += 1;
        state.biographies.push({
          id          : `bio-${bioSeq}`,
          personaId   : String(d.personaId),
          chapterId   : String(d.chapterId),
          chapterNo   : Number(d.chapterNo),
          category    : String(d.category),
          isEffective : Boolean(d.isEffective),
          recordSource: String((d.recordSource as string | undefined) ?? "AI")
        });
      }
      return { count: data.length };
    }),
    count: vi.fn(async ({ where }: { where: { personaId: string; isEffective: boolean } }) => {
      return state.biographies.filter(
        (b) => b.personaId === where.personaId && b.isEffective === where.isEffective
      ).length;
    })
  };

  const prisma = {
    book: {
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        return state.book.id === where.id ? state.book : null;
      })
    },
    chapter: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        return state.chapters.filter((c) => where.id.in.includes(c.id));
      })
    },
    persona: {
      findMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        return state.personas.filter((p) => where.id.in.includes(p.id));
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { deathChapterNo?: number; effectiveBiographyCount?: number } }) => {
        const p = state.personas.find((x) => x.id === where.id);
        if (p !== undefined) {
          if (data.deathChapterNo !== undefined) p.deathChapterNo = data.deathChapterNo;
          if (data.effectiveBiographyCount !== undefined) p.effectiveBiographyCount = data.effectiveBiographyCount;
        }
        return p ?? null;
      })
    },
    personaMention: {
      findMany: vi.fn(
        async (args: {
          where?   : { bookId?: string; promotedPersonaId?: { not: null } };
          select?  : Record<string, boolean>;
          distinct?: string[];
          orderBy? : unknown;
        }) => {
          const bookId = args.where?.bookId;
          let rows = state.mentions.filter((m) => (bookId ? m.bookId === bookId : true));
          if (args.where?.promotedPersonaId !== undefined) {
            rows = rows.filter((m) => m.promotedPersonaId !== null);
          }
          if (args.distinct?.includes("promotedPersonaId")) {
            const seen = new Set<string>();
            rows = rows.filter((m) => {
              const key = m.promotedPersonaId ?? "";
              if (seen.has(key)) return false;
              seen.add(key);
              return true;
            });
          }
          if (Array.isArray(args.orderBy)) {
            rows = [...rows].sort((a, b) => a.chapterNo - b.chapterNo);
          }
          return rows;
        }
      )
    },
    biographyRecord: txBiographyRecord,
    mergeSuggestion: {
      create: vi.fn(async ({ data }: { data: Omit<SuggestionSeed, "id"> }) => {
        const row: SuggestionSeed = { id: `sug-${state.suggestions.length + 1}`, ...data };
        state.suggestions.push(row);
        return { id: row.id };
      })
    },
    chapterPreprocessResult: {
      findUnique: vi.fn(async ({ where }: { where: { chapterId: string } }) => {
        return state.preprocess.find((p) => p.chapterId === where.chapterId) ?? null;
      })
    },
    $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
      fn({ biographyRecord: txBiographyRecord })
    )
  } as unknown as StageCPrismaClient;

  (prisma as unknown as { _bioDeleteCalls: typeof bioDeleteCalls })._bioDeleteCalls = bioDeleteCalls;
  (prisma as unknown as { _bioCreateCalls: typeof bioCreateCalls })._bioCreateCalls = bioCreateCalls;
  return prisma;
}

function setupPromptMock(): void {
  hoisted.resolvePromptTemplate.mockResolvedValue({
    system   : "sys",
    user     : "user:{chapterNo}|{regionMap}|{chapterText}|{resolvedPersonas}|{mentions}|{bookTypeFewShots}",
    versionId: "v1",
    versionNo: 1,
    codeRef  : null
  });
  hoisted.getFewShots.mockResolvedValue("FEW_SHOTS");
}

beforeEach(() => {
  vi.clearAllMocks();
  setupPromptMock();
});

// ───────────────────────────────────────────────────────────────────────
// parseStageCResponse
// ───────────────────────────────────────────────────────────────────────

describe("parseStageCResponse", () => {
  it("解析标准 {records:[...]}", () => {
    const out = parseStageCResponse(JSON.stringify({
      records: [
        {
          personaCanonicalName: "王冕",
          narrativeLens       : "SELF",
          narrativeRegionType : "NARRATIVE",
          category            : "CAREER",
          rawSpan             : "王冕入京赴考",
          actionVerb          : "赴考",
          confidence          : 0.9
        }
      ]
    }));
    expect(out).toHaveLength(1);
    expect(out[0].personaCanonicalName).toBe("王冕");
  });

  it("兜底顶层数组也接受", () => {
    const out = parseStageCResponse(JSON.stringify([
      { personaCanonicalName: "王冕", narrativeLens: "SELF", rawSpan: "王冕读书" }
    ]));
    expect(out).toHaveLength(1);
  });

  it("畸形 JSON → 抛 StageCAttributionError", () => {
    expect(() => parseStageCResponse("not json")).toThrowError(StageCAttributionError);
  });

  it("缺少 records 数组 → 抛错", () => {
    expect(() => parseStageCResponse(JSON.stringify({ foo: 1 }))).toThrowError(StageCAttributionError);
  });

  it("narrativeLens 枚举外 → 降级 SELF", () => {
    const out = parseStageCResponse(JSON.stringify({
      records: [{ personaCanonicalName: "王冕", narrativeLens: "FOO", rawSpan: "x" }]
    }));
    expect(out[0].narrativeLens).toBe("SELF");
  });

  it("rawSpan 缺失 / 空 → 丢弃该条", () => {
    const out = parseStageCResponse(JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", rawSpan: "" },
        { personaCanonicalName: "王冕", narrativeLens: "SELF", rawSpan: "x" }
      ]
    }));
    expect(out).toHaveLength(1);
  });

  it("confidence 超界 clamp 到 [0,1]", () => {
    const out = parseStageCResponse(JSON.stringify({
      records: [{ personaCanonicalName: "王冕", narrativeLens: "SELF", rawSpan: "x", confidence: 1.5 }]
    }));
    expect(out[0].confidence).toBe(1);
  });

  it("category 未知 → 降级 EVENT", () => {
    const out = parseStageCResponse(JSON.stringify({
      records: [{ personaCanonicalName: "王冕", narrativeLens: "SELF", rawSpan: "x", category: "UNKNOWN" }]
    }));
    expect(out[0].category).toBe("EVENT");
  });
});

// ───────────────────────────────────────────────────────────────────────
// 端到端：区段硬约束综合触发
// ───────────────────────────────────────────────────────────────────────

describe("StageCAttributor 端到端 · 区段覆写", () => {
  it("POEM 区段 biography → HISTORICAL；COMMENTARY → REPORTED；NARRATIVE 不改写", async () => {
    const chapterText = "有诗为证黄河之水天东流。却说王冕从此拜别老母辞家远行结束。";
    // POEM: indexOf("黄河之水天东流") = 4, length 7 → 4..11
    // COMMENTARY: "却说..." 开头到末尾
    const poemStart = chapterText.indexOf("黄河之水天东流");
    const commStart = chapterText.indexOf("却说");
    const state = createState({
      personas: [
        { id: "p-wm", name: "王冕", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 },
        { id: "p-lb", name: "李白", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }
      ],
      chapters: [{ id: "ch-1", no: 1, content: chapterText }],
      mentions: [
        {
          id               : "m1", chapterId        : "ch-1", chapterNo        : 1, surfaceForm      : "王冕", aliasTypeHint    : "NAMED",
          identityClaim    : "SELF", actionVerb       : "辞家", rawSpan          : "王冕从此拜别老母", promotedPersonaId: "p-wm",
          bookId           : "book-1"
        },
        {
          id               : "m2", chapterId        : "ch-1", chapterNo        : 1, surfaceForm      : "李白", aliasTypeHint    : "NAMED",
          identityClaim    : "HISTORICAL", actionVerb       : null, rawSpan          : "黄河之水天东流", promotedPersonaId: "p-lb",
          bookId           : "book-1"
        }
      ],
      preprocess: [
        {
          chapterId: "ch-1",
          regions  : [
            { type: "POEM", start: poemStart, end: poemStart + 7, text: "" },
            { type: "COMMENTARY", start: commStart, end: chapterText.length, text: "" }
          ],
          deathMarkers: []
        }
      ]
    });

    const llmResponse = JSON.stringify({
      records: [
        // POEM 区段但 LLM 误标 SELF → 应覆写 HISTORICAL
        {
          personaCanonicalName: "李白",
          narrativeLens       : "SELF",
          narrativeRegionType : "NARRATIVE",
          category            : "EVENT",
          rawSpan             : "黄河之水天东流",
          actionVerb          : null
        },
        // COMMENTARY 区段但 LLM 误标 SELF → 覆写 REPORTED
        {
          personaCanonicalName: "王冕",
          narrativeLens       : "SELF",
          narrativeRegionType : "NARRATIVE",
          category            : "TRAVEL",
          rawSpan             : "王冕从此拜别老母",
          actionVerb          : "辞家"
        }
      ]
    });

    const ai = mockAiClient([llmResponse]);
    const prisma = mockPrisma(state);
    const attributor = new StageCAttributor(ai, prisma);
    const result = await attributor.attribute({ bookId: "book-1" });

    expect(result.biographiesCreated).toBe(2);
    expect(result.overrideHits).toMatchObject({
      [BIOGRAPHY_REGION_OVERRIDE_RULES.POEM_FORCE_HISTORICAL]    : 1,
      [BIOGRAPHY_REGION_OVERRIDE_RULES.COMMENTARY_FORCE_REPORTED]: 1
    });
    const libai = result.biographies.find((b) => b.personaCanonicalName === "李白")!;
    const wangmian = result.biographies.find((b) => b.personaCanonicalName === "王冕")!;
    expect(libai.narrativeLens).toBe("HISTORICAL");
    expect(wangmian.narrativeLens).toBe("REPORTED");
  });

  it("DIALOGUE 第三方 → QUOTED；引入句主语 → 保留 SELF（REV-1）", async () => {
    const chapterText = "王冕道：“范进中举后发了疯，郁郁不得志。”众人听了都笑。";
    const dialogueStart = 0;
    const dialogueEnd = chapterText.indexOf("众人");
    const state = createState({
      personas: [
        { id: "p-wm", name: "王冕", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 },
        { id: "p-fj", name: "范进", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }
      ],
      chapters: [{ id: "ch-1", no: 1, content: chapterText }],
      mentions: [
        { id: "m1", chapterId: "ch-1", chapterNo: 1, surfaceForm: "王冕", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "道", rawSpan: "王冕道", promotedPersonaId: "p-wm", bookId: "book-1" },
        { id: "m2", chapterId: "ch-1", chapterNo: 1, surfaceForm: "范进", aliasTypeHint: "NAMED", identityClaim: "QUOTED", actionVerb: "中举", rawSpan: "范进中举后发了疯", promotedPersonaId: "p-fj", bookId: "book-1" }
      ],
      preprocess: [
        {
          chapterId: "ch-1",
          regions  : [
            {
              type        : "DIALOGUE",
              start       : dialogueStart, end         : dialogueEnd,
              text        : "",
              speaker     : "王冕",
              speakerStart: 0,
              speakerEnd  : 2
            }
          ],
          deathMarkers: []
        }
      ]
    });

    const llmResponse = JSON.stringify({
      records: [
        // 王冕是引入句主语 → REV-1 保留 SELF
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "SOCIAL", rawSpan: "王冕道", actionVerb: "道" },
        // 范进在引号内被提及 → 强制 QUOTED
        { personaCanonicalName: "范进", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "范进中举后发了疯", actionVerb: "中举" }
      ]
    });

    const ai = mockAiClient([llmResponse]);
    const prisma = mockPrisma(state);
    const result = await new StageCAttributor(ai, prisma).attribute({ bookId: "book-1" });

    const wm = result.biographies.find((b) => b.personaCanonicalName === "王冕")!;
    const fj = result.biographies.find((b) => b.personaCanonicalName === "范进")!;
    expect(wm.narrativeLens).toBe("SELF");
    expect(wm.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_SELF_PRESERVED);
    expect(fj.narrativeLens).toBe("QUOTED");
    expect(fj.regionOverrideApplied).toBe(BIOGRAPHY_REGION_OVERRIDE_RULES.DIALOGUE_QUOTED_THIRD_PARTY);
  });
});

// ───────────────────────────────────────────────────────────────────────
// §0-6 四条件过滤
// ───────────────────────────────────────────────────────────────────────

describe("StageCAttributor · §0-6 四条件", () => {
  function buildFourConditionState(): TestState {
    const chapterText = "王冕勤学苦读多年终于中举衣锦还乡这段文字足够长以便测试。";
    return createState({
      personas: [{ id: "p-wm", name: "王冕", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }],
      chapters: [{ id: "ch-1", no: 1, content: chapterText }],
      mentions: [
        { id: "m1", chapterId: "ch-1", chapterNo: 1, surfaceForm: "王冕", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "中举", rawSpan: "王冕勤学苦读多年终于中举衣锦还乡", promotedPersonaId: "p-wm", bookId: "book-1" }
      ],
      preprocess: [{ chapterId: "ch-1", regions: [], deathMarkers: [] }]
    });
  }

  it("rawSpan < 15 字 → isEffective=false 但仍落库", async () => {
    const state = buildFourConditionState();
    const llm = JSON.stringify({
      records: [
        // rawSpan 短 → isEffective false
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "CAREER", rawSpan: "王冕中举", actionVerb: "中举" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.biographiesCreated).toBe(1);
    expect(r.effectiveBiographies).toBe(0);
    expect(r.biographies[0].isEffective).toBe(false);
  });

  it("rawSpan=5 字 + actionVerb 有值 → 仍不满足（15 字门槛）", async () => {
    const state = buildFourConditionState();
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "CAREER", rawSpan: "王冕中举了", actionVerb: "中举" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.biographies[0].isEffective).toBe(false);
  });

  it("actionVerb 为 null → isEffective=false", async () => {
    const state = buildFourConditionState();
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "王冕勤学苦读多年终于中举衣锦还乡", actionVerb: null }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.biographies[0].isEffective).toBe(false);
    expect(r.effectiveBiographies).toBe(0);
  });

  it("actionVerb 空串 → isEffective=false", async () => {
    const state = buildFourConditionState();
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "王冕勤学苦读多年终于中举衣锦还乡", actionVerb: "" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.biographies[0].isEffective).toBe(false);
  });

  it("四条件全满足 → isEffective=true 且 persona.effectiveBiographyCount 更新", async () => {
    const state = buildFourConditionState();
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "王冕勤学苦读多年终于中举衣锦还乡", actionVerb: "中举" }
      ]
    });
    const prisma = mockPrisma(state);
    const r = await new StageCAttributor(mockAiClient([llm]), prisma).attribute({ bookId: "book-1" });
    expect(r.biographies[0].isEffective).toBe(true);
    expect(r.effectiveBiographies).toBe(1);
    const wm = state.personas.find((p) => p.id === "p-wm")!;
    expect(wm.effectiveBiographyCount).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────
// §0-2 双源死亡
// ───────────────────────────────────────────────────────────────────────

describe("StageCAttributor · §0-2 双源死亡", () => {
  function buildDeathState(opts: {
    stage0Hit?  : { subject: string; chapterId: string; chapterNo: number } | null;
    chapterCText: string;
  }): TestState {
    const preprocess = opts.stage0Hit
      ? [
          {
            chapterId   : opts.stage0Hit.chapterId,
            regions     : [],
            deathMarkers: [
              {
                chapterNo       : opts.stage0Hit.chapterNo,
                marker          : "卒",
                subjectCandidate: opts.stage0Hit.subject,
                spanStart       : 0,
                spanEnd         : 1,
                rawSpan         : opts.stage0Hit.subject + "卒"
              }
            ]
          }
        ]
      : [];

    return createState({
      personas: [{ id: "p-fj", name: "范进", aliases: ["范举人"], deathChapterNo: null, effectiveBiographyCount: 0 }],
      chapters: [{ id: "ch-5", no: 5, content: opts.chapterCText }],
      mentions: [
        { id: "m1", chapterId: "ch-5", chapterNo: 5, surfaceForm: "范进", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "病逝", rawSpan: "范进病逝于府中留下遗嘱若干其家人甚是悲痛", promotedPersonaId: "p-fj", bookId: "book-1" }
      ],
      preprocess
    });
  }

  it("仅 Stage 0 命中 → 写入 deathChapterNo，source=STAGE_0", async () => {
    const state = buildDeathState({
      stage0Hit   : { subject: "范进", chapterId: "ch-5", chapterNo: 5 },
      chapterCText: "这一章写别的不涉及死亡事件"
    });
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "范进", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "某事件文本不够长", actionVerb: "做事" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(1);
    expect(r.deathChapterUpdates[0].source).toBe("STAGE_0");
    expect(r.deathChapterUpdates[0].chapterNo).toBe(5);
    expect(state.personas[0].deathChapterNo).toBe(5);
  });

  it("仅 Stage 0 命中（subject 通过别名匹配）→ 仍写入", async () => {
    const state = buildDeathState({
      stage0Hit   : { subject: "范举人", chapterId: "ch-5", chapterNo: 5 },
      chapterCText: "本章内容与死亡无直接关联描述"
    });
    const llm = JSON.stringify({ records: [] });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(1);
    expect(r.deathChapterUpdates[0].source).toBe("STAGE_0");
  });

  it("仅 Stage C DEATH → 写入 deathChapterNo，source=STAGE_C", async () => {
    const state = buildDeathState({
      stage0Hit   : null,
      chapterCText: "范进年迈多病终于在府中安详离世享年八十"
    });
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "范进", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "DEATH", rawSpan: "范进年迈多病终于在府中安详离世享年八十", actionVerb: "离世" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(1);
    expect(r.deathChapterUpdates[0].source).toBe("STAGE_C");
    expect(r.deathChapterUpdates[0].chapterNo).toBe(5);
    expect(state.personas[0].deathChapterNo).toBe(5);
  });

  it("Stage C DEATH 但 category 不是 DEATH → 不更新 deathChapterNo", async () => {
    const state = buildDeathState({
      stage0Hit   : null,
      chapterCText: "这一段与死亡无关"
    });
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "范进", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "CAREER", rawSpan: "范进升任官职巡视地方甚是威风八面受人敬仰", actionVerb: "升任" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(0);
    expect(state.personas[0].deathChapterNo).toBeNull();
  });

  it("两源一致 → source=BOTH", async () => {
    const state = buildDeathState({
      stage0Hit   : { subject: "范进", chapterId: "ch-5", chapterNo: 5 },
      chapterCText: "范进老病故去"
    });
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "范进", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "DEATH", rawSpan: "范进病故离世留下一众亲族子孙奔走哀悼情绪", actionVerb: "病故" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(1);
    expect(r.deathChapterUpdates[0].source).toBe("BOTH");
    expect(r.deathChapterUpdates[0].chapterNo).toBe(5);
  });

  it("冲突以 Stage 0 为准（Stage 0 章节 3 vs Stage C 章节 5）", async () => {
    // 构造两个章节：Stage 0 的 death marker 落在 ch-3；Stage C 的 DEATH 落在 ch-5
    const state: TestState = createState({
      personas: [{ id: "p-fj", name: "范进", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }],
      chapters: [
        { id: "ch-3", no: 3, content: "这一章讲范进的早年" },
        { id: "ch-5", no: 5, content: "此章写范进晚年身体每况愈下描述细节甚多" }
      ],
      mentions: [
        { id: "m1", chapterId: "ch-3", chapterNo: 3, surfaceForm: "范进", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "赴考", rawSpan: "范进赴考", promotedPersonaId: "p-fj", bookId: "book-1" },
        { id: "m2", chapterId: "ch-5", chapterNo: 5, surfaceForm: "范进", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "辞世", rawSpan: "范进辞世归于尘土留下遗嘱文书若干", promotedPersonaId: "p-fj", bookId: "book-1" }
      ],
      preprocess: [
        {
          chapterId   : "ch-3",
          regions     : [],
          deathMarkers: [
            { chapterNo: 3, marker: "卒", subjectCandidate: "范进", spanStart: 0, spanEnd: 1, rawSpan: "范进卒" }
          ]
        },
        { chapterId: "ch-5", regions: [], deathMarkers: [] }
      ]
    });

    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "范进", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "DEATH", rawSpan: "范进辞世归于尘土留下遗嘱文书若干", actionVerb: "辞世" }
      ]
    });
    // Two chapters → LLM called twice (Stage 0 chapter 3 will have empty records since no deaths there)
    const llmCh3 = JSON.stringify({ records: [] });
    const r = await new StageCAttributor(mockAiClient([llmCh3, llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(1);
    expect(r.deathChapterUpdates[0].source).toBe("STAGE_0");
    expect(r.deathChapterUpdates[0].chapterNo).toBe(3);
    expect(r.deathChapterUpdates[0].stage0ChapterNo).toBe(3);
    expect(r.deathChapterUpdates[0].stageCChapterNo).toBe(5);
    expect(state.personas[0].deathChapterNo).toBe(3);
  });

  it("Stage 0 回退路径：无 chapter_preprocess_results 行 → 现场 preprocessChapter", async () => {
    // 章节正文包含死亡正则 "范进病逝"；不 seed preprocess row
    const state: TestState = createState({
      personas: [{ id: "p-fj", name: "范进", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }],
      chapters: [{ id: "ch-5", no: 5, content: "前情如此范进病逝于家中" }],
      mentions: [
        { id: "m1", chapterId: "ch-5", chapterNo: 5, surfaceForm: "范进", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "病逝", rawSpan: "范进病逝于家中", promotedPersonaId: "p-fj", bookId: "book-1" }
      ],
      preprocess: [] // 空
    });
    const llm = JSON.stringify({ records: [] });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.deathChapterUpdates).toHaveLength(1);
    expect(r.deathChapterUpdates[0].source).toBe("STAGE_0");
    expect(r.deathChapterUpdates[0].chapterNo).toBe(5);
  });
});

// ───────────────────────────────────────────────────────────────────────
// §0-14 反馈：STAGE_C_FEEDBACK
// ───────────────────────────────────────────────────────────────────────

describe("StageCAttributor · §0-14 反馈通道", () => {
  it("LLM 指向本章未晋级 persona（但同书存在）→ 写 STAGE_C_FEEDBACK", async () => {
    const state: TestState = createState({
      personas: [
        { id: "p-np", name: "牛浦", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 },
        // 牛布衣同书存在但本章没 mention 促成的 group
        { id: "p-nby", name: "牛布衣", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }
      ],
      chapters: [
        { id: "ch-20", no: 20, content: "前一章牛布衣作诗" },
        { id: "ch-21", no: 21, content: "此章牛浦到郭铁笔店谎称牛布衣文墨造假图书" }
      ],
      mentions: [
        { id: "m1", chapterId: "ch-21", chapterNo: 21, surfaceForm: "牛浦", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "谎称", rawSpan: "牛浦到郭铁笔店", promotedPersonaId: "p-np", bookId: "book-1" },
        // 同本书中牛布衣 mention 位于别的章（但 promotedPersonaId 已存在，使 loadPersonas 把他拉回来）
        { id: "m2", chapterId: "ch-20", chapterNo: 20, surfaceForm: "牛布衣", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "作诗", rawSpan: "牛布衣作诗", promotedPersonaId: "p-nby", bookId: "book-1" }
      ],
      preprocess: [{ chapterId: "ch-21", regions: [], deathMarkers: [] }, { chapterId: "ch-20", regions: [], deathMarkers: [] }]
    });

    // Ch20 LLM 响应空；Ch21 LLM 把 biography 归给"牛布衣"，但本章 group 只有牛浦
    const llmCh20 = JSON.stringify({ records: [] });
    const llmCh21 = JSON.stringify({
      records: [
        { personaCanonicalName: "牛布衣", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "牛浦到郭铁笔店谎称牛布衣文墨造假图书", actionVerb: "谎称" }
      ]
    });
    const prisma = mockPrisma(state);
    const r = await new StageCAttributor(mockAiClient([llmCh20, llmCh21]), prisma).attribute({ bookId: "book-1" });
    expect(r.feedbackSuggestions).toHaveLength(1);
    expect(r.feedbackSuggestions[0].kind).toBe("ENTITY_REVIEW");
    expect(state.suggestions).toHaveLength(1);
    expect(state.suggestions[0].source).toBe("STAGE_C_FEEDBACK");
    expect(state.suggestions[0].status).toBe("PENDING");
  });

  it("LLM 指向的 personaCanonicalName 完全不存在（同书也找不到）→ 跳过 biography，不写反馈", async () => {
    const state: TestState = createState({
      personas  : [{ id: "p-wm", name: "王冕", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }],
      chapters  : [{ id: "ch-1", no: 1, content: "王冕读书苦读多年" }],
      mentions  : [{ id: "m1", chapterId: "ch-1", chapterNo: 1, surfaceForm: "王冕", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "读书", rawSpan: "王冕读书", promotedPersonaId: "p-wm", bookId: "book-1" }],
      preprocess: [{ chapterId: "ch-1", regions: [], deathMarkers: [] }]
    });
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "凭空人物", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "EVENT", rawSpan: "某段文字", actionVerb: "做事" }
      ]
    });
    const r = await new StageCAttributor(mockAiClient([llm]), mockPrisma(state)).attribute({ bookId: "book-1" });
    expect(r.feedbackSuggestions).toHaveLength(0);
    expect(r.biographiesCreated).toBe(0);
  });
});

// ───────────────────────────────────────────────────────────────────────
// 幂等
// ───────────────────────────────────────────────────────────────────────

describe("StageCAttributor · 幂等", () => {
  function buildIdempotentState(): TestState {
    return createState({
      personas  : [{ id: "p-wm", name: "王冕", aliases: [], deathChapterNo: null, effectiveBiographyCount: 0 }],
      chapters  : [{ id: "ch-1", no: 1, content: "王冕读书勤奋刻苦用功不辍成就非凡" }],
      mentions  : [{ id: "m1", chapterId: "ch-1", chapterNo: 1, surfaceForm: "王冕", aliasTypeHint: "NAMED", identityClaim: "SELF", actionVerb: "读书", rawSpan: "王冕读书勤奋刻苦用功不辍成就非凡", promotedPersonaId: "p-wm", bookId: "book-1" }],
      preprocess: [{ chapterId: "ch-1", regions: [], deathMarkers: [] }]
    });
  }

  it("首次跑 + 再跑 → deleteMany 先删旧记录再 createMany", async () => {
    const state = buildIdempotentState();
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "CAREER", rawSpan: "王冕读书勤奋刻苦用功不辍成就非凡", actionVerb: "读书" }
      ]
    });
    const prisma = mockPrisma(state);
    // 第一次
    await new StageCAttributor(mockAiClient([llm]), prisma).attribute({ bookId: "book-1" });
    expect(state.biographies).toHaveLength(1);
    const firstId = state.biographies[0].id;

    // 第二次
    await new StageCAttributor(mockAiClient([llm]), prisma).attribute({ bookId: "book-1" });
    expect(state.biographies).toHaveLength(1);
    // 被删后重建 → id 变化
    expect(state.biographies[0].id).not.toBe(firstId);

    // deleteMany 调用两次：首次空删，第二次有删
    const deleteCalls = (prisma as unknown as { _bioDeleteCalls: Array<{ chapterIds: string[] }> })._bioDeleteCalls;
    expect(deleteCalls.length).toBeGreaterThanOrEqual(2);
    expect(deleteCalls[1].chapterIds).toEqual(["ch-1"]);
  });

  it("重跑 effectiveBiographyCount 不翻倍（deleteMany 清理后 count 回落）", async () => {
    const state = buildIdempotentState();
    const llm = JSON.stringify({
      records: [
        { personaCanonicalName: "王冕", narrativeLens: "SELF", narrativeRegionType: "NARRATIVE", category: "CAREER", rawSpan: "王冕读书勤奋刻苦用功不辍成就非凡", actionVerb: "读书" }
      ]
    });
    const prisma = mockPrisma(state);
    await new StageCAttributor(mockAiClient([llm]), prisma).attribute({ bookId: "book-1" });
    expect(state.personas[0].effectiveBiographyCount).toBe(1);
    await new StageCAttributor(mockAiClient([llm]), prisma).attribute({ bookId: "book-1" });
    expect(state.personas[0].effectiveBiographyCount).toBe(1);
  });
});

// ───────────────────────────────────────────────────────────────────────
// Book 不存在
// ───────────────────────────────────────────────────────────────────────

describe("StageCAttributor · 异常路径", () => {
  it("book 不存在 → 抛错", async () => {
    const state = createState();
    const prisma = mockPrisma(state);
    await expect(
      new StageCAttributor(mockAiClient(["{\"records\":[]}"]), prisma).attribute({ bookId: "non-exist" })
    ).rejects.toThrow(/book not found/);
  });

  it("无 promoted mentions → 返回空结果不调 LLM", async () => {
    const state = createState();
    const ai = mockAiClient(["{\"records\":[]}"]);
    const prisma = mockPrisma(state);
    const r = await new StageCAttributor(ai, prisma).attribute({ bookId: "book-1" });
    expect(r.biographiesCreated).toBe(0);
    expect(r.llmInvocations).toBe(0);
    expect(ai.generateJsonMock).not.toHaveBeenCalled();
  });
});
