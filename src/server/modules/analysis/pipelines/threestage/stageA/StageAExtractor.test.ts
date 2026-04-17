/**
 * 被测对象：Stage A `StageAExtractor` 主服务（端到端，mock AI + mock Prisma）。
 * 测试目标：
 *   - Prompt 组装：regionMap / chapterNo / chapterText / bookTypeFewShots 正确注入
 *   - 解析异常：畸形 JSON / 缺少 mentions 数组 → 抛 StageAExtractionError
 *   - 幂等落库：同 (bookId, chapterId) 重跑 deleteMany + createMany
 *   - override 规则综合触发：POEM/COMMENTARY/DIALOGUE 各覆写类别计数
 *   - preprocessorConfidence 透传
 *   - mentionCount 正确
 *   - UNSURE 允许 LLM 使用（不报错）
 *   - aliasType 枚举外 → 降级 UNSURE，保留 mention
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { parseStageAResponse, StageAExtractionError, StageAExtractor  } from "@/server/modules/analysis/pipelines/threestage/stageA/StageAExtractor";

import type { AiProviderClient, AiGenerateResult } from "@/server/providers/ai";
import type { StageAPrismaClient } from "@/server/modules/analysis/pipelines/threestage/stageA/StageAExtractor";

// Hoisted mocks：resolvePromptTemplate + getFewShots
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

// ── Mock 工厂 ────────────────────────────────────────────────────────────

function mockAiClient(response: string): AiProviderClient & { generateJsonMock: ReturnType<typeof vi.fn> } {
  const generateJsonMock = vi.fn(async (): Promise<AiGenerateResult> => ({
    content: response,
    usage  : null
  }));
  return {
    generateJson: generateJsonMock,
    generateJsonMock
  };
}

interface RecordingPrisma extends StageAPrismaClient {
  _deleteCalls: Array<{ bookId: string; chapterId: string }>;
  _createCalls: Array<Array<Record<string, unknown>>>;
}

function mockPrisma(): RecordingPrisma {
  const deleteCalls: Array<{ bookId: string; chapterId: string }> = [];
  const createCalls: Array<Array<Record<string, unknown>>> = [];

  const tx = {
    personaMention: {
      deleteMany: vi.fn(async ({ where }: { where: { bookId: string; chapterId: string } }) => {
        deleteCalls.push({ ...where });
        return { count: 0 };
      }),
      createMany: vi.fn(async ({ data }: { data: Array<Record<string, unknown>> }) => {
        createCalls.push(data);
        return { count: data.length };
      })
    }
  };

  const prisma = {
    personaMention: tx.personaMention,
    $transaction  : vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx))
  } as unknown as StageAPrismaClient;

  return Object.assign(prisma, { _deleteCalls: deleteCalls, _createCalls: createCalls });
}

function setupPromptMock(): void {
  hoisted.resolvePromptTemplate.mockResolvedValue({
    system   : "sys",
    user     : "user:{chapterNo}|{regionMap}|{chapterText}|{bookTypeFewShots}",
    versionId: "v1",
    versionNo: 1,
    codeRef  : null
  });
  hoisted.getFewShots.mockResolvedValue("FEW_SHOTS_PLACEHOLDER");
}

// ── parseStageAResponse 单测 ────────────────────────────────────────────

describe("parseStageAResponse", () => {
  it("解析标准 {mentions:[...]}", () => {
    const out = parseStageAResponse(JSON.stringify({
      mentions: [
        {
          surfaceForm        : "王冕",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "NARRATIVE",
          suspectedResolvesTo: null,
          evidenceRawSpan    : "王冕读书",
          actionVerb         : "读",
          confidence         : 0.9
        }
      ]
    }));
    expect(out).toHaveLength(1);
    expect(out[0].surfaceForm).toBe("王冕");
    expect(out[0].identityClaim).toBe("SELF");
  });

  it("兜底顶层数组也接受", () => {
    const out = parseStageAResponse(JSON.stringify([
      {
        surfaceForm    : "秦老",
        aliasType      : "NAMED",
        identityClaim  : "QUOTED",
        evidenceRawSpan: "秦老",
        confidence     : 0.7
      }
    ]));
    expect(out).toHaveLength(1);
  });

  it("畸形 JSON → 抛 StageAExtractionError", () => {
    expect(() => parseStageAResponse("not json at all")).toThrowError(StageAExtractionError);
  });

  it("缺少 mentions 数组 → 抛 StageAExtractionError", () => {
    expect(() => parseStageAResponse(JSON.stringify({ foo: "bar" }))).toThrowError(StageAExtractionError);
  });

  it("aliasType 枚举外 → 降级 UNSURE", () => {
    const out = parseStageAResponse(JSON.stringify({
      mentions: [
        {
          surfaceForm    : "王冕",
          aliasType      : "INVALID_TYPE",
          identityClaim  : "SELF",
          evidenceRawSpan: "王冕",
          confidence     : 0.8
        }
      ]
    }));
    expect(out).toHaveLength(1);
    expect(out[0].aliasType).toBe("UNSURE");
  });

  it("identityClaim 枚举外 → 降级 UNSURE（不抛错）", () => {
    const out = parseStageAResponse(JSON.stringify({
      mentions: [{ surfaceForm: "王冕", aliasType: "NAMED", identityClaim: "FOO", evidenceRawSpan: "王冕", confidence: 0.5 }]
    }));
    expect(out[0].identityClaim).toBe("UNSURE");
  });

  it("UNSURE 作为合法值被保留", () => {
    const out = parseStageAResponse(JSON.stringify({
      mentions: [{ surfaceForm: "王冕", aliasType: "UNSURE", identityClaim: "UNSURE", evidenceRawSpan: "王冕", confidence: 0.3 }]
    }));
    expect(out[0].aliasType).toBe("UNSURE");
    expect(out[0].identityClaim).toBe("UNSURE");
  });

  it("surfaceForm 空或超长 → 丢弃", () => {
    const out = parseStageAResponse(JSON.stringify({
      mentions: [
        { surfaceForm: "", aliasType: "NAMED", identityClaim: "SELF", evidenceRawSpan: "x", confidence: 0.9 },
        { surfaceForm: "王冕王冕王冕王冕王冕王冕王冕王冕王冕王冕王冕", aliasType: "NAMED", identityClaim: "SELF", evidenceRawSpan: "x", confidence: 0.9 },
        { surfaceForm: "王冕", aliasType: "NAMED", identityClaim: "SELF", evidenceRawSpan: "x", confidence: 0.9 }
      ]
    }));
    expect(out).toHaveLength(1);
  });

  it("confidence 超界 → clamp 到 [0,1]", () => {
    const out = parseStageAResponse(JSON.stringify({
      mentions: [{ surfaceForm: "王冕", aliasType: "NAMED", identityClaim: "SELF", evidenceRawSpan: "x", confidence: 1.5 }]
    }));
    expect(out[0].confidence).toBe(1);
  });
});

// ── StageAExtractor 端到端 ──────────────────────────────────────────────

describe("StageAExtractor.extract", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupPromptMock();
  });

  it("端到端：DIALOGUE 引入句主语保留 SELF + 引号内第三方覆写 QUOTED", async () => {
    const chapterText = "王冕道：\u201c秦老家要做寿。\u201d后来他自去读书了半日，然后写字练习很久。";

    const aiResponse = JSON.stringify({
      mentions: [
        {
          surfaceForm        : "王冕",
          aliasType          : "NAMED",
          identityClaim      : "SELF",
          narrativeRegionType: "DIALOGUE",
          evidenceRawSpan    : "王冕道：\u201c秦老家要做寿。\u201d",
          actionVerb         : "道",
          confidence         : 0.95
        },
        {
          surfaceForm        : "秦老",
          aliasType          : "NAMED",
          identityClaim      : "SELF", // LLM 误判，应被覆写为 QUOTED
          narrativeRegionType: "DIALOGUE",
          evidenceRawSpan    : "秦老家要做寿",
          actionVerb         : null,
          confidence         : 0.8
        }
      ]
    });

    const ai = mockAiClient(aiResponse);
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    const result = await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText,
      bookTypeCode: "CLASSICAL_NOVEL"
    });

    expect(result.mentionCount).toBe(2);
    expect(result.mentions[0].identityClaim).toBe("SELF");
    expect(result.mentions[0].regionOverrideApplied).toBe("DIALOGUE_SELF_PRESERVED");
    expect(result.mentions[1].identityClaim).toBe("QUOTED");
    expect(result.mentions[1].regionOverrideApplied).toBe("DIALOGUE_QUOTED_THIRD_PARTY");
    expect(result.overrideHits.DIALOGUE_SELF_PRESERVED).toBe(1);
    expect(result.overrideHits.DIALOGUE_QUOTED_THIRD_PARTY).toBe(1);
    expect(result.regionBreakdown.DIALOGUE).toBe(2);
  });

  it("Prompt 占位符正确注入：chapterNo / chapterText / regionMap / fewShots", async () => {
    const ai = mockAiClient(JSON.stringify({ mentions: [] }));
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 7,
      chapterText : "此时王冕走进庭院，日已西斜影子甚长。",
      bookTypeCode: "CLASSICAL_NOVEL"
    });

    expect(hoisted.resolvePromptTemplate).toHaveBeenCalledTimes(1);
    const call = hoisted.resolvePromptTemplate.mock.calls[0][0];
    expect(call.slug).toBe("STAGE_A_EXTRACT_MENTIONS");
    expect(call.replacements.chapterNo).toBe("7");
    expect(call.replacements.chapterText).toContain("王冕");
    expect(call.replacements.bookTypeFewShots).toBe("FEW_SHOTS_PLACEHOLDER");
    expect(typeof call.replacements.regionMap).toBe("string");
    // 同时传 regionAnnotations 别名
    expect(call.replacements.regionAnnotations).toBe(call.replacements.regionMap);

    expect(hoisted.getFewShots).toHaveBeenCalledWith("CLASSICAL_NOVEL", "STAGE_A");
  });

  it("幂等：先 deleteMany({bookId, chapterId})，再 createMany", async () => {
    const ai = mockAiClient(JSON.stringify({
      mentions: [{ surfaceForm: "王冕", aliasType: "NAMED", identityClaim: "SELF", narrativeRegionType: "NARRATIVE", evidenceRawSpan: "王冕读书", confidence: 0.9 }]
    }));
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText : "王冕读书度日，每日都是如此勤奋认真。",
      bookTypeCode: "CLASSICAL_NOVEL",
      jobId       : "job-1"
    });

    expect(prisma._deleteCalls).toEqual([{ bookId: "book-1", chapterId: "chap-1" }]);
    expect(prisma._createCalls).toHaveLength(1);
    expect(prisma._createCalls[0]).toHaveLength(1);
    const row = prisma._createCalls[0][0];
    expect(row.bookId).toBe("book-1");
    expect(row.chapterId).toBe("chap-1");
    expect(row.chapterNo).toBe(1);
    expect(row.jobId).toBe("job-1");
    expect(row.surfaceForm).toBe("王冕");
    expect(row.aliasTypeHint).toBe("NAMED");
    expect(row.rawSpan).toBe("王冕读书");
  });

  it("mentions 空数组 → 仍执行 deleteMany，不调 createMany（幂等清理）", async () => {
    const ai = mockAiClient(JSON.stringify({ mentions: [] }));
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText : "段落。",
      bookTypeCode: "GENERIC"
    });

    expect(prisma._deleteCalls).toHaveLength(1);
    expect(prisma._createCalls).toHaveLength(0);
  });

  it("LLM 畸形 JSON → 抛 StageAExtractionError（含 rawResponse）", async () => {
    const ai = mockAiClient("not json");
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    await expect(extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText : "王冕读书。",
      bookTypeCode: "GENERIC"
    })).rejects.toMatchObject({ name: "StageAExtractionError", rawResponse: "not json" });

    // 抛错前不应写库
    expect(prisma._deleteCalls).toHaveLength(0);
    expect(prisma._createCalls).toHaveLength(0);
  });

  it("preprocessorConfidence LOW 透传到结果", async () => {
    const ai = mockAiClient(JSON.stringify({ mentions: [] }));
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    // 构造低 CJK 密度章节 → Stage 0 LOW
    const result = await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText : "!!! ### @@@\nabc 123 xyz\n??? --- ~~~\na1\nb2\nc3\nx y z\n$ % ^\n( ) { }\n< > =",
      bookTypeCode: "GENERIC"
    });

    expect(result.preprocessorConfidence).toBe("LOW");
  });

  it("POEM + COMMENTARY 覆写综合：overrideHits 计数正确", async () => {
    const chapterText = "有诗为证：王冕诗中人。此诗道尽世态。\n却说秦老平生好客。";

    const aiResponse = JSON.stringify({
      mentions: [
        {
          surfaceForm        : "王冕",
          aliasType          : "NAMED",
          identityClaim      : "SELF", // → HISTORICAL
          narrativeRegionType: "POEM",
          evidenceRawSpan    : "王冕诗中人",
          confidence         : 0.9
        },
        {
          surfaceForm        : "秦老",
          aliasType          : "NAMED",
          identityClaim      : "SELF", // → REPORTED
          narrativeRegionType: "COMMENTARY",
          evidenceRawSpan    : "秦老平生好客",
          confidence         : 0.9
        }
      ]
    });

    const ai = mockAiClient(aiResponse);
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    const result = await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText,
      bookTypeCode: "CLASSICAL_NOVEL"
    });

    expect(result.mentions[0].identityClaim).toBe("HISTORICAL");
    expect(result.mentions[1].identityClaim).toBe("REPORTED");
    expect(result.overrideHits.POEM_FORCE_HISTORICAL).toBe(1);
    expect(result.overrideHits.COMMENTARY_FORCE_REPORTED).toBe(1);
    expect(result.regionBreakdown.POEM).toBe(1);
    expect(result.regionBreakdown.COMMENTARY).toBe(1);
  });

  it("温度参数 0（确定性输出）传给 AI client", async () => {
    const ai = mockAiClient(JSON.stringify({ mentions: [] }));
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText : "王冕读书一章。",
      bookTypeCode: "GENERIC"
    });

    const generateJson = ai.generateJsonMock;
    expect(generateJson).toHaveBeenCalledWith(
      expect.objectContaining({ system: expect.any(String), user: expect.any(String) }),
      expect.objectContaining({ temperature: 0 })
    );
  });

  it("spanStart/spanEnd 写入 DB 行", async () => {
    const text = "前置王冕走进庭院尾巴";
    const ai = mockAiClient(JSON.stringify({
      mentions: [{
        surfaceForm        : "王冕",
        aliasType          : "NAMED",
        identityClaim      : "SELF",
        narrativeRegionType: "NARRATIVE",
        evidenceRawSpan    : "王冕走进庭院",
        confidence         : 0.9
      }]
    }));
    const prisma = mockPrisma();
    const extractor = new StageAExtractor(ai, prisma);

    await extractor.extract({
      bookId      : "book-1",
      chapterId   : "chap-1",
      chapterNo   : 1,
      chapterText : text,
      bookTypeCode: "GENERIC"
    });

    const row = prisma._createCalls[0][0];
    expect(row.spanStart).toBe(text.indexOf("王冕"));
    expect(row.spanEnd).toBe(row.spanStart as number + 2);
  });
});
