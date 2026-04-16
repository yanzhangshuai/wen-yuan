/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { ProcessingStatus } from "@/generated/prisma/enums";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  chapterAnalysisTesting,
  createChapterAnalysisService,
  mergeChunkResultsForAnalysis,
  mergeRosterEntriesForAnalysis
} from "@/server/modules/analysis/services/ChapterAnalysisService";
import { ANALYSIS_PIPELINE_CONFIG } from "@/server/modules/analysis/config/pipeline";
import type { AliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";
import { createPersonaResolver } from "@/server/modules/analysis/services/PersonaResolver";
import { createMergePersonasService } from "@/server/modules/personas/mergePersonas";
import { PipelineStage } from "@/types/pipeline";
import { createAiProviderClient } from "@/server/providers/ai";
import { decryptValue } from "@/server/security/encryption";

vi.mock("@/server/modules/analysis/services/PersonaResolver", () => ({
  createPersonaResolver: vi.fn()
}));

vi.mock("@/server/providers/ai", () => ({
  createAiProviderClient: vi.fn()
}));

vi.mock("@/server/security/encryption", () => ({
  decryptValue: vi.fn()
}));

vi.mock("@/server/modules/personas/mergePersonas", () => ({
  createMergePersonasService: vi.fn().mockReturnValue({
    mergePersonas: vi.fn().mockResolvedValue({ redirectedRelationships: 0 })
  })
}));

vi.mock("@/server/modules/knowledge", () => ({
  resolvePromptTemplate: vi.fn().mockImplementation(async () => ({ system: "mock-system", user: "mock-user" }))
}));

vi.mock("@/server/modules/analysis/services/ValidationAgentService", () => ({
  validationAgentService: {
    validateChapterResult: vi.fn()
  },
  createValidationAgentService: vi.fn()
}));

function buildChapter(overrides: Partial<{
  id       : string;
  bookId   : string;
  no       : number;
  title    : string;
  content  : string;
  aiModelId: string | null;
  book     : Record<string, unknown>;
}> = {}) {
  const {
    book: overrideBook,
    ...restOverrides
  } = overrides;

  const baseBook = {
    title    : "儒林外史",
    aiModelId: "model-1",
    profiles : [{
      personaId: "persona-existing",
      localName: "范进",
      persona  : {
        name   : "范进",
        aliases: ["范秀才"]
      }
    }]
  };

  return {
    id     : "chapter-1",
    bookId : "book-1",
    no     : 1,
    title  : "第一回",
    content: "范进中举",
    book   : {
      ...baseBook,
      ...(overrides.aiModelId !== undefined ? { aiModelId: overrides.aiModelId } : {}),
      ...overrideBook
    },
    ...restOverrides
  };
}

function buildEnabledModel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id       : "model-default",
    provider : "deepseek",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    apiKey   : "enc:v1:abc",
    isEnabled: true,
    isDefault: true,
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function createPrismaMock(chapter = buildChapter()) {
  const mentionDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const mentionCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const biographyDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const biographyCreateMany = vi.fn().mockResolvedValue({ count: 0 });
  const relationshipDeleteMany = vi.fn().mockResolvedValue({ count: 0 });
  const relationshipCreateMany = vi.fn().mockResolvedValue({ count: 0 });

  const tx = {
    mention: {
      deleteMany: mentionDeleteMany,
      createMany: mentionCreateMany
    },
    biographyRecord: {
      deleteMany: biographyDeleteMany,
      createMany: biographyCreateMany
    },
    relationship: {
      deleteMany: relationshipDeleteMany,
      createMany: relationshipCreateMany
    }
  };

  const prismaMock = {
    chapter: {
      findUnique: vi.fn().mockResolvedValue(chapter)
    },
    book: {
      findUnique: vi.fn()
    },
    profile: {
      findMany: vi.fn()
    },
    persona: {
      update: vi.fn()
    },
    aiModel: {
      findUnique: vi.fn(),
      findMany  : vi.fn().mockResolvedValue([]),
      findFirst : vi.fn().mockResolvedValue(buildEnabledModel())
    },
    modelStrategyConfig: {
      findFirst: vi.fn().mockResolvedValue(null)
    },
    $transaction: vi.fn().mockImplementation(async (callback: (client: typeof tx) => Promise<unknown>) => {
      return callback(tx);
    })
  };

  return {
    prismaMock,
    tx,
    mentionDeleteMany,
    mentionCreateMany,
    biographyDeleteMany,
    biographyCreateMany,
    relationshipDeleteMany,
    relationshipCreateMany
  };
}

function buildStageModel(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id       : "stage-model",
    modelId  : "deepseek-stage",
    modelName: "deepseek-chat",
    provider : "deepseek",
    apiKey   : "plain-stage-key",
    baseUrl  : "https://api.deepseek.com",
    source   : "SYSTEM_DEFAULT",
    params   : {
      temperature    : 0.15,
      maxOutputTokens: 4096,
      topP           : 1,
      enableThinking : false
    },
    ...overrides
  };
}

/**
 * 创建一个 mock stageAiCallExecutor，根据 stage 返回预设数据。
 * 默认：ROSTER_DISCOVERY 返回空名册，CHUNK_EXTRACTION 返回空提取结果。
 */
function createMockExecutor(stageHandlers: Partial<Record<string, (input: { stage: string; callFn?: unknown }) => unknown>> = {}) {
  const defaultHandlers: Record<string, () => unknown> = {
    [PipelineStage.ROSTER_DISCOVERY]  : () => [],
    [PipelineStage.CHUNK_EXTRACTION]  : () => ({ mentions: [], biographies: [], relationships: [] }),
    [PipelineStage.TITLE_RESOLUTION]  : () => [],
    [PipelineStage.GRAY_ZONE_ARBITRATION]: () => []
  };
  return {
    execute: vi.fn(async (input: { stage: string }) => {
      const handler = stageHandlers[input.stage] ?? defaultHandlers[input.stage];
      const data = handler ? await handler(input) : null;
      return { data, usage: null, modelId: "test-model", isFallback: false };
    })
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("chapter analysis service", () => {
  const mockedCreatePersonaResolver = vi.mocked(createPersonaResolver);
  const mockedCreateAiProviderClient = vi.mocked(createAiProviderClient);
  const mockedDecryptValue = vi.mocked(decryptValue);
  const mockedCreateMergePersonasService = vi.mocked(createMergePersonasService);
  let mergePersonasMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, "info").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});

    mergePersonasMock = vi.fn().mockResolvedValue({ redirectedRelationships: 0 });
    mockedCreateMergePersonasService.mockReturnValue({
      mergePersonas: mergePersonasMock
    } as never);
    mockedCreatePersonaResolver.mockReturnValue({
      resolve: vi.fn().mockResolvedValue({
        status    : "resolved",
        personaId : "persona-existing",
        confidence: 1
      })
    } as never);
    mockedDecryptValue.mockImplementation((value) => `plain:${value}`);
    mockedCreateAiProviderClient.mockReturnValue({ provider: "mocked" } as never);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when chapter does not exist", async () => {
    const { prismaMock } = createPrismaMock(null as never);
    const service = createChapterAnalysisService(prismaMock as never, undefined, createMockExecutor() as never);

    await expect(service.analyzeChapter("missing-chapter", { jobId: "test-job" })).rejects.toThrow("Chapter [missing-chapter] 不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("persists deduplicated records and counts hallucinations", async () => {
    const longParagraph = "甲".repeat(3601);
    const chapter = buildChapter({
      content: `短段落\n\n${longParagraph}\n\n尾段`
    });
    const {
      prismaMock,
      mentionCreateMany,
      biographyCreateMany,
      relationshipCreateMany,
      mentionDeleteMany,
      biographyDeleteMany,
      relationshipDeleteMany
    } = createPrismaMock(chapter);

    const resolveMock = vi.fn(async ({ extractedName }: { extractedName: string }) => {
      if (extractedName === "张三") {
        return {
          status    : "resolved",
          personaId : "persona-zhang",
          confidence: 1
        };
      }
      if (extractedName === "李四") {
        return {
          status     : "created",
          personaId  : "persona-li",
          confidence : 0.8,
          matchedName: "李四"
        };
      }
      return {
        status    : "hallucinated",
        confidence: 0.2,
        reason    : "name_not_in_chapter"
      };
    });
    mockedCreatePersonaResolver.mockReturnValue({ resolve: resolveMock } as never);

    const chunkData = {
      mentions: [
        { personaName: "张三", rawText: "张三", summary: "现身", paraIndex: 0 },
        { personaName: "张三", rawText: "张三", summary: "现身", paraIndex: 0 },
        { personaName: "幻影", rawText: "幻影", paraIndex: 1 }
      ],
      biographies: [
        { personaName: "李四", category: "EVENT", event: "中举", ironyNote: "批判社会" },
        {
          personaName: "李四",
          category   : "CAREER",
          event      : "出仕",
          ironyNote  : "乙".repeat(320)
        },
        { personaName: "幻影", category: "BIRTH", event: "不存在" }
      ],
      relationships: [
        { sourceName: "张三", targetName: "李四", type: "ALLY", description: "a", evidence: "  证据  " },
        { sourceName: "张三", targetName: "李四", type: "ALLY", description: "a", evidence: "证据" },
        { sourceName: "张三", targetName: "张三", type: "SELF", description: "self", evidence: "x" },
        { sourceName: "幻影", targetName: "李四", type: "ALLY" }
      ]
    };
    const emptyChunkData = { mentions: [], biographies: [], relationships: [] };
    const mockExecutor = createMockExecutor({
      [PipelineStage.CHUNK_EXTRACTION]: (input: { stage: string; chunkIndex?: number }) => {
        return input.chunkIndex === 0 ? chunkData : emptyChunkData;
      }
    });
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    const result = await service.analyzeChapter("chapter-1", { jobId: "test-job" });

    expect(result.chapterId).toBe("chapter-1");
    expect(result.chunkCount).toBe(1);
    expect(result.hallucinationCount).toBe(3);
    expect(result.created).toEqual({
      personas     : 1,
      mentions     : 1,
      biographies  : 2,
      relationships: 1
    });

    expect(mentionDeleteMany).toHaveBeenCalledWith({
      where: { chapterId: "chapter-1" }
    });
    expect(biographyDeleteMany).toHaveBeenCalledWith({
      where: { chapterId: "chapter-1", status: ProcessingStatus.DRAFT }
    });
    expect(relationshipDeleteMany).toHaveBeenCalledWith({
      where: { chapterId: "chapter-1", status: ProcessingStatus.DRAFT }
    });

    expect(resolveMock).toHaveBeenCalledTimes(3);

    expect(mentionCreateMany).toHaveBeenCalledWith({
      data: [{
        chapterId: "chapter-1",
        personaId: "persona-zhang",
        rawText  : "张三",
        summary  : "现身",
        paraIndex: 0
      }]
    });

    expect(biographyCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          personaId: "persona-li",
          category : "EVENT",
          ironyNote: undefined
        }),
        expect.objectContaining({
          personaId: "persona-li",
          category : "CAREER",
          ironyNote: "乙".repeat(300)
        })
      ]
    });

    expect(relationshipCreateMany).toHaveBeenCalledWith({
      data: [{
        chapterId  : "chapter-1",
        sourceId   : "persona-zhang",
        targetId   : "persona-li",
        type       : "ALLY",
        weight     : 1,
        description: undefined,
        evidence   : "证据",
        status     : ProcessingStatus.DRAFT
      }]
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("skips createMany calls when ai extraction is empty", async () => {
    const { prismaMock, mentionCreateMany, biographyCreateMany, relationshipCreateMany } = createPrismaMock();

    const service = createChapterAnalysisService(prismaMock as never, undefined, createMockExecutor() as never);

    const result = await service.analyzeChapter("chapter-1", { jobId: "test-job" });

    expect(result.created).toEqual({
      personas     : 0,
      mentions     : 0,
      biographies  : 0,
      relationships: 0
    });
    expect(mentionCreateMany).not.toHaveBeenCalled();
    expect(biographyCreateMany).not.toHaveBeenCalled();
    expect(relationshipCreateMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not retry ai errors when no job context", async () => {
    const { prismaMock } = createPrismaMock();
    const mockExecutor = createMockExecutor({
      [PipelineStage.CHUNK_EXTRACTION]: () => { throw new Error("429 rate limit"); }
    });
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    await expect(service.analyzeChapter("chapter-1", { jobId: "test-job" })).rejects.toThrow("429 rate limit");
    expect(mockExecutor.execute).toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws immediately on non-retryable ai errors", async () => {
    const { prismaMock } = createPrismaMock();
    const mockExecutor = createMockExecutor({
      [PipelineStage.CHUNK_EXTRACTION]: () => { throw new Error("invalid json payload"); }
    });
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    await expect(service.analyzeChapter("chapter-1", { jobId: "test-job" })).rejects.toThrow("invalid json payload");
    expect(mockExecutor.execute).toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("registers high-confidence roster alias hints and passes chapterNo to resolver", async () => {
    const { prismaMock, mentionCreateMany } = createPrismaMock();
    const resolveMock = vi.fn().mockResolvedValue({
      status    : "resolved",
      personaId : "persona-existing",
      confidence: 1
    });
    mockedCreatePersonaResolver.mockReturnValueOnce({ resolve: resolveMock } as never);

    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn(),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    const rosterData = [
      {
        surfaceForm      : "范老爷",
        aliasType        : "NICKNAME",
        suggestedRealName: "范进",
        aliasConfidence  : 0.88,
        contextHint      : {
          alias              : "范老爷",
          aliasType          : "NICKNAME",
          coOccurringPersonas: ["严监生"],
          contextClue        : "与范进同段叙述中举",
          confidence         : 0.88
        }
      }
    ];
    const chunkData = {
      mentions     : [{ personaName: "范老爷", rawText: "范老爷来了", paraIndex: 0 }],
      biographies  : [],
      relationships: []
    };
    const mockExecutor = createMockExecutor({
      [PipelineStage.ROSTER_DISCOVERY]: () => rosterData,
      [PipelineStage.CHUNK_EXTRACTION]: () => chunkData
    });
    const service = createChapterAnalysisService(prismaMock as never, aliasRegistry, mockExecutor as never);

    await service.analyzeChapter("chapter-1", { jobId: "test-job" });

    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "persona-existing",
      alias       : "范老爷",
      resolvedName: "范进",
      aliasType   : "NICKNAME",
      confidence  : 0.88,
      evidence    : "与范进同段叙述中举",
      chapterStart: 1,
      status      : "PENDING"
    }, expect.any(Object));

    const firstResolveInput = resolveMock.mock.calls[0]?.[0] as {
      chapterNo?: number;
      rosterMap : Map<string, string>;
    } | undefined;
    expect(firstResolveInput?.chapterNo).toBe(1);
    expect(firstResolveInput?.rosterMap.get("范老爷")).toBe("persona-existing");
    expect(mentionCreateMany).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("splits long chapters and calls executor for each roster and chunk stage", async () => {
    const chapter = buildChapter({
      content: "甲".repeat(21050)
    });
    const { prismaMock } = createPrismaMock(chapter);

    const rosterData = [{ surfaceForm: "范老爷", aliasType: "TITLE", suggestedRealName: "范进", aliasConfidence: 0.91 }];
    const mockExecutor = createMockExecutor({
      [PipelineStage.ROSTER_DISCOVERY]: () => rosterData,
      [PipelineStage.CHUNK_EXTRACTION]: () => ({ mentions: [], biographies: [], relationships: [] })
    });

    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    const result = await service.analyzeChapter("chapter-1", { jobId: "test-job" });

    expect(result.chunkCount).toBe(3);
    const rosterCalls = mockExecutor.execute.mock.calls.filter(
      ([input]: [{ stage: string }]) => input.stage === PipelineStage.ROSTER_DISCOVERY
    );
    const chunkCalls = mockExecutor.execute.mock.calls.filter(
      ([input]: [{ stage: string }]) => input.stage === PipelineStage.CHUNK_EXTRACTION
    );
    expect(rosterCalls).toHaveLength(2);
    expect(chunkCalls).toHaveLength(3);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("skips roster discovery when external persona map is provided and keeps floor profiles plus referenced persona", async () => {
    const profiles = Array.from({ length: 18 }, (_, index) => ({
      personaId   : `persona-${index + 1}`,
      localName   : `人物${index + 1}`,
      localSummary: `摘要${index + 1}`,
      persona     : {
        name   : `人物${index + 1}`,
        aliases: [`别名${index + 1}`]
      }
    }));
    const chapter = buildChapter({
      book: {
        title    : "儒林外史",
        aiModelId: "model-1",
        profiles
      }
    });
    const { prismaMock } = createPrismaMock(chapter);
    const mockExecutor = createMockExecutor();
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    await service.analyzeChapter("chapter-1", {
      jobId: "test-job",
      externalPersonaMap: new Map([["范老爷", "persona-18"]])
    });

    const rosterCalls = mockExecutor.execute.mock.calls.filter(
      ([input]: [{ stage: string }]) => input.stage === PipelineStage.ROSTER_DISCOVERY
    );
    expect(rosterCalls).toHaveLength(0);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps all profiles when external persona map only contains generic placeholders", async () => {
    const profiles = Array.from({ length: 18 }, (_, index) => ({
      personaId   : `persona-${index + 1}`,
      localName   : `人物${index + 1}`,
      localSummary: `摘要${index + 1}`,
      persona     : {
        name   : `人物${index + 1}`,
        aliases: [`别名${index + 1}`]
      }
    }));
    const chapter = buildChapter({
      book: {
        title    : "儒林外史",
        aiModelId: "model-1",
        profiles
      }
    });
    const { prismaMock } = createPrismaMock(chapter);
    const mockExecutor = createMockExecutor();
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    await service.analyzeChapter("chapter-1", {
      jobId: "test-job",
      externalPersonaMap: new Map([["老爷", "GENERIC"]])
    });

    // 当 externalPersonaMap 只有 GENERIC 项时，不应过滤 profiles
    const rosterCalls = mockExecutor.execute.mock.calls.filter(
      ([input]: [{ stage: string }]) => input.stage === PipelineStage.ROSTER_DISCOVERY
    );
    expect(rosterCalls).toHaveLength(0);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("routes roster discovery and chunk extraction through stage executor when jobId exists", async () => {
    const { prismaMock } = createPrismaMock();
    const generateJson = vi.fn()
      .mockResolvedValueOnce({
        content: JSON.stringify([]),
        usage  : null
      })
      .mockResolvedValueOnce({
        content: JSON.stringify({ mentions: [], biographies: [], relationships: [] }),
        usage  : null
      });
    mockedCreateAiProviderClient.mockReturnValue({ generateJson } as never);

    const execute = vi.fn(async ({ callFn }: {
      stage : PipelineStage;
      callFn: (input: { model: ReturnType<typeof buildStageModel> }) => Promise<unknown>;
    }) => {
      return await callFn({ model: buildStageModel() });
    });

    const service = createChapterAnalysisService(
      prismaMock as never,
      undefined,
      { execute } as never
    );

    await service.analyzeChapter("chapter-1", { jobId: "job-1" });

    expect(execute).toHaveBeenCalledTimes(2);
    const executeStages = execute.mock.calls.map(([callInput]) => callInput.stage);
    expect(executeStages[0]).toBe(PipelineStage.ROSTER_DISCOVERY);
    expect(executeStages[1]).toBe(PipelineStage.CHUNK_EXTRACTION);
    expect(generateJson).toHaveBeenCalledTimes(2);
    expect(generateJson).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      temperature    : 0.15,
      maxOutputTokens: 4096
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("persists alias mapping after title resolution", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({
          title    : "儒林外史",
          aiModelId: null
        })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            localSummary: "明朝开国人物",
            persona     : { id: "title-1", name: "太祖皇帝" }
          }
        ])
      },
      persona: {
        findFirst: vi.fn().mockResolvedValue(null),
        update   : vi.fn().mockResolvedValue({})
      },
      aiModel: {
        findUnique: vi.fn(),
        findMany  : vi.fn().mockResolvedValue([]),
        findFirst : vi.fn().mockResolvedValue({
          id       : "model-default",
          provider : "DeepSeek",
          name     : "DeepSeek V3",
          modelId  : "deepseek-chat",
          baseUrl  : "https://api.deepseek.com",
          apiKey   : "enc:v1:cipher",
          isEnabled: true
        })
      },
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
        // $transaction 内部使用 tx.persona.update，此处模拟
        const txClient = {
          persona     : prismaMock.persona,
          aliasMapping: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }
        };
        return callback(txClient);
      })
    };
    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn(),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    const titleResolutionData = [
      {
        personaId     : "title-1",
        title         : "太祖皇帝",
        realName      : "朱元璋",
        confidence    : 0.93,
        historicalNote: "明太祖"
      }
    ];
    const mockExecutor = createMockExecutor({
      [PipelineStage.TITLE_RESOLUTION]: () => titleResolutionData
    });

    const service = createChapterAnalysisService(prismaMock as never, aliasRegistry, mockExecutor as never);
    const updatedCount = await service.resolvePersonaTitles("book-1", { jobId: "test-job" });

    expect(updatedCount).toBe(1);
    expect(prismaMock.persona.update).toHaveBeenCalledWith({
      where: { id: "title-1" },
      data : {
        name      : "朱元璋",
        nameType  : "NAMED",
        confidence: 0.93,
        aliases   : { push: "太祖皇帝" }
      }
    });
    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "title-1",
      alias       : "太祖皇帝",
      resolvedName: "朱元璋",
      aliasType   : "TITLE",
      confidence  : 0.93,
      evidence    : "明太祖",
      status      : "CONFIRMED"
    }, expect.any(Object));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 0 when resolvePersonaTitles book is missing", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue(null)
      },
      profile: {
        findMany: vi.fn()
      },
      persona: {
        findFirst: vi.fn(),
        update   : vi.fn()
      },
      aiModel: {
        findUnique: vi.fn(),
        findMany  : vi.fn().mockResolvedValue([]),
        findFirst : vi.fn()
      },
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn()
    };

    const service = createChapterAnalysisService(prismaMock as never, undefined, createMockExecutor() as never);

    await expect(service.resolvePersonaTitles("missing-book", { jobId: "test-job" })).resolves.toBe(0);
    expect(prismaMock.profile.findMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 0 when no TITLE_ONLY personas remain for resolvePersonaTitles", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({ title: "儒林外史" })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([])
      },
      persona: {
        findFirst: vi.fn(),
        update   : vi.fn()
      },
      aiModel: {
        findUnique: vi.fn(),
        findMany  : vi.fn().mockResolvedValue([]),
        findFirst : vi.fn()
      },
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn()
    };
    const mockExecutor = createMockExecutor();
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    await expect(service.resolvePersonaTitles("book-1", { jobId: "test-job" })).resolves.toBe(0);
    expect(mockExecutor.execute).not.toHaveBeenCalled();
    expect(prismaMock.persona.update).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("only updates confidence for low-confidence title resolution", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({ title: "儒林外史" })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            localSummary: "科举人物",
            persona     : { id: "title-1", name: "范老爷" }
          }
        ])
      },
      persona: {
        findFirst: vi.fn(),
        update   : vi.fn().mockResolvedValue({})
      },
      aiModel: {
        findUnique: vi.fn(),
        findMany  : vi.fn().mockResolvedValue([]),
        findFirst : vi.fn()
      },
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn()
    };
    const titleResolutionData = [
      {
        personaId     : "title-1",
        title         : "范老爷",
        realName      : "范进",
        confidence    : 0.4,
        historicalNote: "证据不足"
      }
    ];
    const mockExecutor = createMockExecutor({
      [PipelineStage.TITLE_RESOLUTION]: () => titleResolutionData
    });
    const service = createChapterAnalysisService(prismaMock as never, undefined, mockExecutor as never);

    await expect(service.resolvePersonaTitles("book-1", { jobId: "test-job" })).resolves.toBe(0);
    expect(mockExecutor.execute).toHaveBeenCalledTimes(1);
    expect(prismaMock.persona.findFirst).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(prismaMock.persona.update).toHaveBeenCalledWith({
      where: { id: "title-1" },
      data : { confidence: 0.4 }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("routes title resolution through stage executor when jobId exists", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({ title: "儒林外史" })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            localSummary: "明朝开国人物",
            persona     : { id: "title-1", name: "太祖皇帝" }
          }
        ])
      },
      persona: {
        findFirst: vi.fn().mockResolvedValue(null),
        update   : vi.fn().mockResolvedValue({})
      },
      aiModel: {
        findUnique: vi.fn(),
        findMany  : vi.fn().mockResolvedValue([]),
        findFirst : vi.fn()
      },
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
        return callback({
          persona: prismaMock.persona
        });
      })
    };
    const generateJson = vi.fn().mockResolvedValue({
      content: JSON.stringify([{
        personaId : "title-1",
        title     : "太祖皇帝",
        realName  : "朱元璋",
        confidence: 0.8
      }]),
      usage: null
    });
    mockedCreateAiProviderClient.mockReturnValueOnce({ generateJson } as never);

    const execute = vi.fn(async ({ callFn }: { callFn: (input: { model: ReturnType<typeof buildStageModel> }) => Promise<unknown> }) => {
      return await callFn({ model: buildStageModel() });
    });

    const service = createChapterAnalysisService(
      prismaMock as never,
      undefined,
      { execute } as never
    );

    const updatedCount = await service.resolvePersonaTitles("book-1", { jobId: "job-1" });

    expect(updatedCount).toBe(1);
    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      stage: PipelineStage.TITLE_RESOLUTION,
      jobId: "job-1"
    }));
    expect(generateJson).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      temperature    : 0.15,
      maxOutputTokens: 4096
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("records gray-zone mentions and writes arbitration aliases through usage-aware ai client", async () => {
    const originalArbitrationFlag = ANALYSIS_PIPELINE_CONFIG.llmTitleArbitrationEnabled;
    (ANALYSIS_PIPELINE_CONFIG as { llmTitleArbitrationEnabled: boolean }).llmTitleArbitrationEnabled = true;

    try {
      const { prismaMock } = createPrismaMock();
      prismaMock.book.findUnique.mockResolvedValue({ title: "儒林外史" });

      const resolveMock = vi.fn().mockResolvedValue({
        status             : "resolved",
        personaId          : "persona-existing",
        confidence         : 0.84,
        personalizationTier: "gray_zone",
        grayZoneEvidence   : {
          surfaceForm             : "老爷",
          hasStableAliasBinding   : true,
          chapterAppearanceCount  : 2,
          singlePersonaConsistency: true,
          genericRatio            : 0.4
        }
      });
      mockedCreatePersonaResolver.mockReturnValueOnce({ resolve: resolveMock } as never);

      const registerAlias = vi.fn().mockResolvedValue(undefined);
      const aliasRegistry: AliasRegistryService = {
        lookupAlias        : vi.fn(),
        registerAlias,
        loadBookAliasCache : vi.fn(),
        listPendingMappings: vi.fn(),
        listReviewMappings : vi.fn(),
        updateMappingStatus: vi.fn()
      };
      const mockExecutor = createMockExecutor({
        [PipelineStage.CHUNK_EXTRACTION]: () => ({
          mentions     : [{ personaName: "老爷", rawText: "老爷", paraIndex: 0 }],
          biographies  : [],
          relationships: []
        }),
        [PipelineStage.GRAY_ZONE_ARBITRATION]: () => [{
          surfaceForm   : "老爷",
          isPersonalized: true,
          confidence    : 0.8,
          reason        : "跨章稳定绑定"
        }]
      });

      const service = createChapterAnalysisService(prismaMock as never, aliasRegistry, mockExecutor as never);

      const analysis = await service.analyzeChapter("chapter-1", { jobId: "test-job" });
      const written = await service.runGrayZoneArbitration("book-1", { jobId: "test-job" });

      expect(analysis.grayZoneCount).toBe(1);
      expect(mockExecutor.execute).toHaveBeenCalledWith(expect.objectContaining({
        stage: PipelineStage.GRAY_ZONE_ARBITRATION
      }));
      expect(written).toBe(1);
      expect(registerAlias).toHaveBeenCalledWith({
        bookId      : "book-1",
        alias       : "老爷",
        aliasType   : "NICKNAME",
        confidence  : 0.8,
        evidence    : "跨章稳定绑定",
        status      : "LLM_INFERRED",
        resolvedName: undefined
      });
      expect(service.collectGrayZoneMentions("book-1")).toEqual([]);
    } finally {
      (ANALYSIS_PIPELINE_CONFIG as { llmTitleArbitrationEnabled: boolean }).llmTitleArbitrationEnabled = originalArbitrationFlag;
    }
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runs gray-zone arbitration through stage executor and skips non-actionable rows", async () => {
    const originalArbitrationFlag = ANALYSIS_PIPELINE_CONFIG.llmTitleArbitrationEnabled;
    (ANALYSIS_PIPELINE_CONFIG as { llmTitleArbitrationEnabled: boolean }).llmTitleArbitrationEnabled = true;

    try {
      const { prismaMock } = createPrismaMock();
      prismaMock.book.findUnique.mockResolvedValue({ title: "儒林外史" });

      const resolveMock = vi.fn().mockResolvedValue({
        status             : "resolved",
        personaId          : "persona-existing",
        confidence         : 0.84,
        personalizationTier: "gray_zone",
        grayZoneEvidence   : {
          surfaceForm             : "老爷",
          hasStableAliasBinding   : true,
          chapterAppearanceCount  : 3,
          singlePersonaConsistency: true,
          genericRatio            : 0.45
        }
      });
      mockedCreatePersonaResolver.mockReturnValueOnce({ resolve: resolveMock } as never);

      const registerAlias = vi.fn().mockResolvedValue(undefined);
      const aliasRegistry: AliasRegistryService = {
        lookupAlias        : vi.fn(),
        registerAlias,
        loadBookAliasCache : vi.fn(),
        listPendingMappings: vi.fn(),
        listReviewMappings : vi.fn(),
        updateMappingStatus: vi.fn()
      };
      const generateJson = vi.fn().mockResolvedValue({
        content: JSON.stringify([
          { surfaceForm: "老爷", isPersonalized: false, confidence: 0.9 },
          { surfaceForm: "陌生称呼", isPersonalized: true, confidence: 0.9 },
          { surfaceForm: "老爷", isPersonalized: true, confidence: 0 },
          { surfaceForm: "老爷", isPersonalized: true, confidence: 0.6 }
        ]),
        usage: null
      });
      mockedCreateAiProviderClient.mockReturnValueOnce({ generateJson } as never);

      const chunkGenerateJson = vi.fn().mockResolvedValue({
        content: JSON.stringify({
          mentions     : [{ personaName: "老爷", rawText: "老爷", paraIndex: 0 }],
          biographies  : [],
          relationships: []
        }),
        usage: null
      });
      mockedCreateAiProviderClient.mockReturnValueOnce({ generateJson: chunkGenerateJson } as never);

      const execute = vi.fn(async ({ callFn }: {
        stage : PipelineStage;
        callFn: (input: { model: ReturnType<typeof buildStageModel> }) => Promise<unknown>;
      }) => {
        return await callFn({ model: buildStageModel() });
      });

      const service = createChapterAnalysisService(
        prismaMock as never,
        aliasRegistry,
        { execute } as never
      );

      await service.analyzeChapter("chapter-1", { jobId: "job-1" });
      const written = await service.runGrayZoneArbitration("book-1", { jobId: "job-1" });

      expect(written).toBe(1);
      const executeStages = execute.mock.calls.map(([callInput]) => callInput.stage);
      expect(executeStages).toContain(PipelineStage.GRAY_ZONE_ARBITRATION);
      expect(registerAlias).toHaveBeenCalledWith({
        bookId      : "book-1",
        alias       : "老爷",
        aliasType   : "NICKNAME",
        confidence  : 0.6,
        evidence    : "Phase 3 gray-zone arbitration",
        status      : "PENDING",
        resolvedName: undefined
      });
    } finally {
      (ANALYSIS_PIPELINE_CONFIG as { llmTitleArbitrationEnabled: boolean }).llmTitleArbitrationEnabled = originalArbitrationFlag;
    }
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("extracts chapter entities through stage executor when jobId is present", async () => {
    const { prismaMock } = createPrismaMock();
    const execute = vi.fn().mockResolvedValue({
      data: [{
        name       : "严监生",
        aliases    : ["严大人"],
        description: "吝啬富户",
        category   : "PERSON"
      }],
      usage: null
    });
    const service = createChapterAnalysisService(
      prismaMock as never,
      undefined,
      { execute } as never
    );

    const result = await service.extractChapterEntities("chapter-1", {
      jobId: "job-1"
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      stage    : PipelineStage.INDEPENDENT_EXTRACTION,
      jobId    : "job-1",
      chapterId: "chapter-1",
      context  : {
        bookId: "book-1",
        jobId : "job-1"
      },
      callFn: expect.any(Function)
    }));
    expect(result).toEqual({
      chapterId: "chapter-1",
      chapterNo: 1,
      entities : [{
        name       : "严监生",
        aliases    : ["严大人"],
        description: "吝啬富户",
        category   : "PERSON"
      }]
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("executes stage callback when extracting chapter entities with job context", async () => {
    const { prismaMock } = createPrismaMock();
    const generateJson = vi.fn().mockResolvedValue({
      content: JSON.stringify([
        {
          name       : "周学道",
          aliases    : ["周大人"],
          description: "主考官",
          category   : "PERSON"
        }
      ]),
      usage: {
        promptTokens    : 11,
        completionTokens: 21,
        totalTokens     : 32
      }
    });
    mockedCreateAiProviderClient.mockReturnValueOnce({ generateJson } as never);
    const execute = vi.fn(async ({ callFn }: { callFn: (input: { model: ReturnType<typeof buildStageModel> }) => Promise<unknown> }) => {
      return await callFn({ model: buildStageModel() });
    });
    const service = createChapterAnalysisService(
      prismaMock as never,
      undefined,
      { execute } as never
    );

    const result = await service.extractChapterEntities("chapter-1", {
      jobId: "job-1"
    });

    expect(execute).toHaveBeenCalledWith(expect.objectContaining({
      stage: PipelineStage.INDEPENDENT_EXTRACTION,
      jobId: "job-1"
    }));
    expect(generateJson).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      temperature    : 0.15,
      maxOutputTokens: 4096
    }));
    expect(result).toEqual({
      chapterId: "chapter-1",
      chapterNo: 1,
      entities : [{
        name       : "周学道",
        aliases    : ["周大人"],
        description: "主考官",
        category   : "PERSON"
      }]
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("merges into existing persona when duplicate found in resolvePersonaTitles", async () => {
    const prismaMock = {
      book: {
        findUnique: vi.fn().mockResolvedValue({
          title    : "儒林外史",
          aiModelId: null
        })
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([
          {
            localSummary: "明朝开国人物",
            persona     : { id: "title-1", name: "太祖皇帝" }
          }
        ])
      },
      persona: {
        // findFirst 返回已存在的 persona（触发合并路径）
        findFirst: vi.fn().mockResolvedValue({ id: "existing-persona-zhu" }),
        update   : vi.fn().mockResolvedValue({})
      },
      aiModel: {
        findUnique: vi.fn(),
        findMany  : vi.fn().mockResolvedValue([]),
        findFirst : vi.fn().mockResolvedValue({
          id       : "model-default",
          provider : "DeepSeek",
          name     : "DeepSeek V3",
          modelId  : "deepseek-chat",
          baseUrl  : "https://api.deepseek.com",
          apiKey   : "enc:v1:cipher",
          isEnabled: true
        })
      },
      modelStrategyConfig: {
        findFirst: vi.fn().mockResolvedValue(null)
      },
      $transaction: vi.fn().mockImplementation(async (callback: (client: unknown) => Promise<unknown>) => {
        const txClient = {
          persona     : prismaMock.persona,
          aliasMapping: { create: vi.fn(), update: vi.fn(), findFirst: vi.fn() }
        };
        return callback(txClient);
      })
    };

    const registerAlias = vi.fn().mockResolvedValue(undefined);
    const aliasRegistry: AliasRegistryService = {
      lookupAlias        : vi.fn(),
      registerAlias,
      loadBookAliasCache : vi.fn(),
      listPendingMappings: vi.fn(),
      listReviewMappings : vi.fn(),
      updateMappingStatus: vi.fn()
    };

    const titleResolutionData = [
      {
        personaId     : "title-1",
        title         : "太祖皇帝",
        realName      : "朱元璋",
        confidence    : 0.95,
        historicalNote: "明太祖洪武帝"
      }
    ];
    const mockExecutor = createMockExecutor({
      [PipelineStage.TITLE_RESOLUTION]: () => titleResolutionData
    });

    const service = createChapterAnalysisService(prismaMock as never, aliasRegistry, mockExecutor as never);
    const updatedCount = await service.resolvePersonaTitles("book-1", { jobId: "test-job" });

    expect(updatedCount).toBe(1);
    // 应调用 mergePersonas 而非 persona.update
    expect(mergePersonasMock).toHaveBeenCalledWith({
      targetId: "existing-persona-zhu",
      sourceId: "title-1"
    });
    // 不应调用 persona.update（因为走的 merge 路径）
    expect(prismaMock.persona.update).not.toHaveBeenCalled();
    // 别名注册应指向合并目标
    expect(registerAlias).toHaveBeenCalledWith({
      bookId      : "book-1",
      personaId   : "existing-persona-zhu",
      alias       : "太祖皇帝",
      resolvedName: "朱元璋",
      aliasType   : "TITLE",
      confidence  : 0.95,
      evidence    : "明太祖洪武帝",
      status      : "CONFIRMED"
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns title-only persona count from profile table", async () => {
    const prismaMock = {
      profile: {
        count: vi.fn().mockResolvedValue(4)
      }
    };
    const service = createChapterAnalysisService(prismaMock as never, undefined, createMockExecutor() as never);

    await expect(service.getTitleOnlyPersonaCount("book-1")).resolves.toBe(4);
    expect(prismaMock.profile.count).toHaveBeenCalledWith({
      where: {
        bookId   : "book-1",
        deletedAt: null,
        persona  : { nameType: "TITLE_ONLY", deletedAt: null }
      }
    });
  });
});

describe("chapter analysis testing helpers", () => {
  it("splits chapter content across paragraph, overflow and overlap branches", () => {
    expect(chapterAnalysisTesting.splitContentIntoChunks("单段正文", 20, 6)).toEqual(["单段正文"]);

    expect(chapterAnalysisTesting.splitContentIntoChunks("甲乙丙\n\n丁戊己", 4, 0)).toEqual([
      "甲乙丙",
      "丁戊己"
    ]);

    expect(chapterAnalysisTesting.splitContentIntoChunks("甲乙丙\n\n丁戊己", 4, 1)).toEqual([
      "甲乙丙",
      "丙丁戊己"
    ]);

    expect(chapterAnalysisTesting.splitContentIntoChunks(`甲乙\n\n${"长".repeat(7)}\n\n丙丁`, 4, 2)).toEqual([
      "甲乙",
      "甲乙长长长长",
      "长长长长长",
      "长长丙丁"
    ]);
  });

  it("normalizes categories and sanitizes biography and relationship text fields", () => {
    expect(chapterAnalysisTesting.normalizeCategory("CAREER")).toBe("CAREER");
    expect(chapterAnalysisTesting.normalizeCategory("UNKNOWN" as never)).toBe("EVENT");

    expect(chapterAnalysisTesting.sanitizeIronyNote()).toBeUndefined();
    expect(chapterAnalysisTesting.sanitizeIronyNote("讽刺")).toBeUndefined();
    expect(chapterAnalysisTesting.sanitizeIronyNote(" 这是在批判社会 ")).toBeUndefined();
    expect(chapterAnalysisTesting.sanitizeIronyNote(`  ${"乙".repeat(320)}  `)).toBe("乙".repeat(300));

    expect(chapterAnalysisTesting.sanitizeRelationshipField()).toBeUndefined();
    expect(chapterAnalysisTesting.sanitizeRelationshipField(" a ")).toBeUndefined();
    expect(chapterAnalysisTesting.sanitizeRelationshipField(`  证据 ${"乙".repeat(410)}  `)).toBe(
      `证据 ${"乙".repeat(397)}`
    );
  });

  it("builds stable entity and profile lookup maps", () => {
    const profiles = [
      {
        personaId    : "persona-1",
        canonicalName: "范进",
        aliases      : ["范举人", " "],
        localSummary : null
      },
      {
        personaId    : "persona-2",
        canonicalName: "严监生",
        aliases      : ["范举人", "严老爷"],
        localSummary : "吝啬"
      }
    ];

    expect(chapterAnalysisTesting.buildEntityIdMap(profiles)).toEqual(new Map([
      [1, "persona-1"],
      [2, "persona-2"]
    ]));
    expect(chapterAnalysisTesting.normalizeLookupKey("  Fan Jin  ")).toBe("fan jin");

    expect(chapterAnalysisTesting.buildProfileLookupMap(profiles)).toEqual(new Map([
      ["范进", { personaId: "persona-1", canonicalName: "范进" }],
      ["范举人", { personaId: "persona-1", canonicalName: "范进" }],
      ["严监生", { personaId: "persona-2", canonicalName: "严监生" }],
      ["严老爷", { personaId: "persona-2", canonicalName: "严监生" }]
    ]));
  });

  it("collects generic title ratios while skipping blank roster surface forms", () => {
    expect(chapterAnalysisTesting.collectGenericRatiosFromRoster([
      { surfaceForm: "老爷", generic: true },
      { surfaceForm: " 老爷 ", generic: false },
      { surfaceForm: "老爷", generic: true },
      { surfaceForm: "范进", generic: false },
      { surfaceForm: "   ", generic: true }
    ])).toEqual(new Map([
      ["老爷", { generic: 2, nonGeneric: 1 }],
      ["范进", { generic: 0, nonGeneric: 1 }]
    ]));
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("chapter analysis merge helpers", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("deduplicates mentions when personaName/rawText/paraIndex are identical", () => {
    // Arrange
    const results = [{
      mentions: [
        { personaName: "范进", rawText: "范进", paraIndex: 0, summary: "首次出现" },
        { personaName: "范进", rawText: "范进", paraIndex: 0, summary: "重复出现" }
      ],
      biographies  : [],
      relationships: []
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);

    // Assert
    // paraIndex 相同表示同段同称谓，属于重复 mention，应折叠为单条。
    expect(merged.mentions).toHaveLength(1);
    expect(merged.mentions[0]).toMatchObject({
      personaName: "范进",
      rawText    : "范进",
      paraIndex  : 0
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps mentions when paraIndex differs", () => {
    // Arrange
    const results = [{
      mentions: [
        { personaName: "范进", rawText: "范进", paraIndex: 0 },
        { personaName: "范进", rawText: "范进", paraIndex: 1 }
      ],
      biographies  : [],
      relationships: []
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);

    // Assert
    // paraIndex 不同表示来自不同段落，不应被误判为重复 mention。
    expect(merged.mentions).toHaveLength(2);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns stable result for empty input and single-chunk input", () => {
    // Arrange
    const singleChunk = [{
      mentions   : [{ personaName: "严监生", rawText: "严监生", paraIndex: 3 }],
      biographies: [{
        personaName: "严监生",
        category   : "EVENT" as const,
        event      : "病中伸二指"
      }],
      relationships: []
    }];

    // Act
    const emptyMerged = mergeChunkResultsForAnalysis([]);
    const singleMerged = mergeChunkResultsForAnalysis(singleChunk);

    // Assert
    // 空输入必须稳定返回空结构，避免调用方出现 undefined 分支。
    expect(emptyMerged).toEqual({
      mentions     : [],
      biographies  : [],
      relationships: []
    });
    // 单分片输入应保持原样，防止 merge 逻辑引入额外副作用。
    expect(singleMerged).toEqual(singleChunk[0]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("merges relationships with max weight and caps evidence entries at five", () => {
    // Arrange
    const results = [{
      mentions     : [],
      biographies  : [],
      relationships: [
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "师生",
          weight    : 0.3,
          evidence  : "证据1"
        },
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "师生",
          weight    : 0.9,
          evidence  : "证据2；证据3；证据4；证据5；证据6；证据7"
        }
      ]
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);
    const relationship = merged.relationships[0];
    const evidenceItems = relationship?.evidence?.split("；") ?? [];

    // Assert
    expect(merged.relationships).toHaveLength(1);
    // 合并后权重取 max，确保强证据关系优先保留。
    expect(relationship?.weight).toBe(0.9);
    // evidence 限制为 5 条，防止异常长文本污染后续展示与日志统计。
    expect(evidenceItems).toHaveLength(5);
    expect(evidenceItems).toEqual(["证据1", "证据2", "证据3", "证据4", "证据5"]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to mention base keys and collapses empty relationship evidence to undefined", () => {
    // Arrange
    const results = [{
      mentions: [
        { personaName: "范进", rawText: "范进" },
        { personaName: "范进", rawText: "范进" }
      ],
      biographies: [
        {
          personaName: "范进",
          category   : "EVENT" as const,
          event      : "乡试中举"
        },
        {
          personaName: "范进",
          category   : "EVENT" as const,
          event      : "乡试中举"
        }
      ],
      relationships: [
        {
          sourceName : "范进",
          targetName : "周学道",
          type       : "师生",
          description: "旧描述"
        },
        {
          sourceName: "范进",
          targetName: "周学道",
          type      : "师生",
          evidence  : "   "
        }
      ]
    }];

    // Act
    const merged = mergeChunkResultsForAnalysis(results);

    // Assert
    // paraIndex 缺失时应退化为 personaName + rawText 去重，兼容历史输出。
    expect(merged.mentions).toHaveLength(1);
    // biography 同键事件应只保留一条。
    expect(merged.biographies).toHaveLength(1);
    // 空白 evidence 与缺省 weight 不应生成脏值，description 保留更早的完整描述。
    expect(merged.relationships).toHaveLength(1);
    expect(merged.relationships[0]).toMatchObject({
      sourceName : "范进",
      targetName : "周学道",
      type       : "师生",
      description: "旧描述"
    });
    expect(merged.relationships[0]?.weight).toBeUndefined();
    expect(merged.relationships[0]?.evidence).toBeUndefined();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("deduplicates roster by normalized name + alias type and trims whitespace", () => {
    // Arrange
    const entries = [
      {
        surfaceForm      : " 范老爷 ",
        aliasType        : "NICKNAME" as const,
        suggestedRealName: "范进",
        aliasConfidence  : 0.6
      },
      {
        surfaceForm      : "范老爷",
        aliasType        : "NICKNAME" as const,
        suggestedRealName: "范进",
        aliasConfidence  : 0.8
      },
      {
        surfaceForm      : "范老爷",
        aliasType        : "TITLE" as const,
        suggestedRealName: "范进",
        aliasConfidence  : 0.7
      }
    ];

    // Act
    const merged = mergeRosterEntriesForAnalysis(entries);
    const nickname = merged.find((item) => item.aliasType === "NICKNAME");
    const title = merged.find((item) => item.aliasType === "TITLE");

    // Assert
    // 同一 normalizedName 在不同 aliasType 下应保留多条（称谓类型语义不同）。
    expect(merged).toHaveLength(2);
    // surfaceForm 应被 trim，aliasConfidence 保留较高值。
    expect(nickname?.surfaceForm).toBe("范老爷");
    expect(nickname?.aliasConfidence).toBe(0.8);
    expect(title?.surfaceForm).toBe("范老爷");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("skips blank roster surface forms and merges sparse duplicates through fallback keys", () => {
    // Arrange
    const entries: Parameters<typeof mergeRosterEntriesForAnalysis>[0] = [
      {
        surfaceForm      : "   ",
        aliasType        : "TITLE" as const,
        suggestedRealName: "张大人",
        aliasConfidence  : 0.9
      },
      {
        surfaceForm      : " 张大人 ",
        suggestedRealName: "   ",
        entityId         : 7,
        generic          : true,
        contextHint      : {
          alias              : "张大人",
          aliasType          : "TITLE" as const,
          coOccurringPersonas: ["范进"],
          contextClue        : "第 1 章提到的官员",
          confidence         : 0.8
        }
      },
      {
        surfaceForm      : "张大人",
        aliasConfidence  : 0.4,
        isNew            : true,
        isTitleOnly      : true,
        generic          : undefined,
        suggestedRealName: undefined
      }
    ];

    // Act
    const merged = mergeRosterEntriesForAnalysis(entries);

    // Assert
    // 空白 surfaceForm 应被直接跳过，不应污染名册。
    expect(merged).toHaveLength(1);
    // suggestedRealName 为空白时应回退到 surfaceForm 去重，同时保留已有更完整字段。
    expect(merged[0]).toMatchObject({
      surfaceForm    : "张大人",
      entityId       : 7,
      aliasConfidence: 0.4,
      isNew          : true,
      isTitleOnly    : true,
      contextHint    : expect.objectContaining({
        contextClue: "第 1 章提到的官员"
      })
    });
    // generic 采用 existing && normalized 语义，避免后续弱证据把泛化称谓误保真。
    expect(merged[0]?.generic).toBeUndefined();
  });
});
