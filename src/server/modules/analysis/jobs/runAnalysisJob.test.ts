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

import { AnalysisJobStatus, AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  clearKnowledgeCache,
  loadFullRuntimeKnowledge,
  type FullRuntimeKnowledge
} from "@/server/modules/knowledge/load-book-knowledge";
import { createAnalysisJobRunner, markOrphanPersonas } from "@/server/modules/analysis/jobs/runAnalysisJob";

vi.mock("@/server/modules/knowledge/load-book-knowledge", () => ({
  clearKnowledgeCache     : vi.fn(),
  loadFullRuntimeKnowledge: vi.fn()
}));

// resolveThreeStageAiClient 内部调用 createModelStrategyResolver，
// 通过 mock 避免引入数据库查询与 encryption 依赖，不影响既有 sequential 架构测试。
vi.mock(
  "@/server/modules/analysis/services/ModelStrategyResolver",
  async (importOriginal: () => Promise<Record<string, unknown>>) => {
    const actual = await importOriginal();
    const mockResolverInstance = {
      preloadStrategy: vi.fn().mockResolvedValue(new Map()),
      resolveForStage: vi.fn().mockResolvedValue({
        modelId    : "mock-model-id",
        provider   : "deepseek",
        modelName  : "deepseek-chat",
        displayName: "DeepSeek Chat",
        baseUrl    : "https://api.deepseek.com",
        apiKey     : "sk-mock-plain",
        source     : "SYSTEM_DEFAULT",
        params     : {}
      }),
      resolveFallback : vi.fn(),
      resolveWithRetry: vi.fn()
    };
    return {
      ...actual,
      createModelStrategyResolver: vi.fn(() => mockResolverInstance),
      modelStrategyResolver      : mockResolverInstance
    };
  }
);

function createRuntimeKnowledge(overrides: Partial<FullRuntimeKnowledge> = {}): FullRuntimeKnowledge {
  return {
    bookId              : "book-1",
    bookTypeKey         : null,
    lexiconConfig       : {},
    aliasLookup         : new Map<string, string>(),
    historicalFigures   : new Set<string>(),
    historicalFigureMap : new Map(),
    relationalTerms     : new Set<string>(),
    namePatternRules    : [],
    hardBlockSuffixes   : new Set<string>(),
    softBlockSuffixes   : new Set<string>(),
    safetyGenericTitles : new Set<string>(),
    defaultGenericTitles: new Set<string>(),
    titlePatterns       : [],
    positionPatterns    : [],
    loadedAt            : new Date("2026-01-01T00:00:00.000Z"),
    ...overrides
  };
}

function createRunnerContext(options: { withValidation?: boolean } = {}) {
  const analysisJobFindUnique = vi.fn();
  const analysisJobFindFirst = vi.fn();
  const analysisJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const analysisJobUpdate = vi.fn().mockResolvedValue({});
  const chapterFindMany = vi.fn().mockResolvedValue([]);
  const chapterFindUnique = vi.fn().mockResolvedValue({
    id     : "chapter-1",
    no     : 1,
    title  : "第一回",
    content: "范进中举",
    bookId : "book-1"
  });
  const chapterUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const chapterUpdate = vi.fn().mockResolvedValue({});
  const bookFindUnique = vi.fn().mockResolvedValue({ title: "儒林外史" });
  const bookUpdate = vi.fn().mockResolvedValue({});
  const bookUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const transaction = vi.fn(async (operationsOrCallback: Promise<unknown>[] | ((tx: unknown) => Promise<unknown>)) => {
    if (typeof operationsOrCallback === "function") {
      return await operationsOrCallback({});
    }
    return await Promise.all(operationsOrCallback);
  });
  const analyzeChapter = vi.fn().mockResolvedValue({
    chapterId         : "chapter-1",
    chunkCount        : 1,
    hallucinationCount: 0,
    created           : { personas: 1, mentions: 1, biographies: 1, relationships: 1 }
  });
  // Phase 5 真名溯源：默认返回 0（无 TITLE_ONLY persona），不影响既有测试断言。
  const resolvePersonaTitles = vi.fn().mockResolvedValue(0);
  const getTitleOnlyPersonaCount = vi.fn().mockResolvedValue(0);
  const validateBookResult = vi.fn().mockResolvedValue({
    id     : "report-default",
    issues : [],
    summary: {
      totalIssues : 0,
      errorCount  : 0,
      warningCount: 0,
      infoCount   : 0,
      autoFixable : 0,
      needsReview : 0
    }
  });
  const applyAutoFixes = vi.fn().mockResolvedValue(0);
  const validateChapterResult = vi.fn().mockResolvedValue({
    id     : "report-chapter",
    issues : [],
    summary: {
      totalIssues : 0,
      errorCount  : 0,
      warningCount: 0,
      infoCount   : 0,
      autoFixable : 0,
      needsReview : 0
    }
  });
  // 孤儿检测所需：默认无档案 → 无孤儿，不影响既有测试断言。
  const profileFindMany = vi.fn().mockResolvedValue([]);
  const mentionGroupBy = vi.fn().mockResolvedValue([]);
  const mentionFindMany = vi.fn().mockResolvedValue([]);
  const relationshipFindMany = vi.fn().mockResolvedValue([]);
  const personaFindMany = vi.fn().mockResolvedValue([]);
  const personaUpdateMany = vi.fn().mockResolvedValue({ count: 0 });
  const analysisRunCreate = vi.fn().mockResolvedValue({ id: "run-observable" });
  const analysisRunUpdate = vi.fn().mockResolvedValue({});
  const analysisRunFindFirst = vi.fn().mockResolvedValue(null);
  const analysisStageRunCreate = vi.fn().mockResolvedValue({ id: "stage-run-observable" });
  const analysisStageRunUpdate = vi.fn().mockResolvedValue({});
  const llmRawOutputAggregate = vi.fn().mockResolvedValue({
    _sum: {
      promptTokens       : 0,
      completionTokens   : 0,
      totalTokens        : 0,
      estimatedCostMicros: BigInt(0)
    }
  });
  const llmRawOutputCreate = vi.fn().mockResolvedValue({ id: "raw-observable" });

  const runGrayZoneArbitration = vi.fn().mockResolvedValue(0);
  const chapterAnalyzer = options.withValidation
    ? { analyzeChapter, resolvePersonaTitles, getTitleOnlyPersonaCount, runGrayZoneArbitration, validateChapterResult, validateBookResult, applyAutoFixes }
    : { analyzeChapter, resolvePersonaTitles, getTitleOnlyPersonaCount, runGrayZoneArbitration, validateChapterResult };
  const resolvedChapterAnalyzer = chapterAnalyzer;
  const prismaMock = {
    analysisRun: {
      create   : analysisRunCreate,
      update   : analysisRunUpdate,
      findFirst: analysisRunFindFirst
    },
    analysisStageRun: {
      create: analysisStageRunCreate,
      update: analysisStageRunUpdate
    },
    llmRawOutput: {
      aggregate: llmRawOutputAggregate,
      create   : llmRawOutputCreate
    }
  };

  const writeSequentialReviewOutput = vi.fn().mockResolvedValue({});
  const rebuildReviewProjection = vi.fn().mockResolvedValue({});

  const runner = createAnalysisJobRunner({
    analysisJob: {
      findUnique: analysisJobFindUnique,
      findFirst : analysisJobFindFirst,
      updateMany: analysisJobUpdateMany,
      update    : analysisJobUpdate
    },
    chapter         : { findMany: chapterFindMany, findUnique: chapterFindUnique, updateMany: chapterUpdateMany, update: chapterUpdate },
    book            : { findUnique: bookFindUnique, update: bookUpdate, updateMany: bookUpdateMany },
    profile         : { findMany: profileFindMany },
    mention         : { groupBy: mentionGroupBy, findMany: mentionFindMany },
    relationship    : { findMany: relationshipFindMany },
    persona         : { findMany: personaFindMany, updateMany: personaUpdateMany },
    analysisRun     : prismaMock.analysisRun,
    analysisStageRun: prismaMock.analysisStageRun,
    llmRawOutput    : prismaMock.llmRawOutput,
    $transaction    : transaction
  } as never, resolvedChapterAnalyzer, undefined, undefined, {
    writeSequentialReviewOutput,
    rebuildReviewProjection
  });

  return {
    runner,
    prismaMock,
    analysisJobFindUnique,
    analysisJobFindFirst,
    analysisJobUpdateMany,
    analysisJobUpdate,
    chapterFindMany,
    chapterFindUnique,
    chapterUpdateMany,
    chapterUpdate,
    bookFindUnique,
    bookUpdate,
    bookUpdateMany,
    transaction,
    analyzeChapter,
    resolvePersonaTitles,
    getTitleOnlyPersonaCount,
    validateBookResult,
    validateChapterResult,
    applyAutoFixes,
    runGrayZoneArbitration,
    profileFindMany,
    mentionGroupBy,
    mentionFindMany,
    relationshipFindMany,
    personaFindMany,
    personaUpdateMany,
    writeSequentialReviewOutput,
    rebuildReviewProjection
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("analysis job runner", () => {
  const mockedClearKnowledgeCache = vi.mocked(clearKnowledgeCache);
  const mockedLoadFullRuntimeKnowledge = vi.mocked(loadFullRuntimeKnowledge);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedLoadFullRuntimeKnowledge.mockResolvedValue(createRuntimeKnowledge());
    mockedClearKnowledgeCache.mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runs queued job and marks job/book as succeeded", async () => {
    const jobId = "job-1";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      analysisJobUpdateMany,
      analysisJobUpdate,
      chapterFindMany,
      transaction,
      analyzeChapter,
      chapterUpdate,
      bookUpdateMany
    } = createRunnerContext();

    // cancel checks: 1 extra findUnique per chapter
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.QUEUED,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-1", no: 1 },
      { id: "chapter-2", no: 2 }
    ]);

    await runner.runAnalysisJobById(jobId);

    expect(analysisJobUpdateMany).toHaveBeenCalledWith({
      where: {
        id    : jobId,
        status: AnalysisJobStatus.QUEUED
      },
      data: expect.objectContaining({
        status: AnalysisJobStatus.RUNNING
      })
    });
    expect(chapterFindMany).toHaveBeenCalledWith({
      where  : { bookId, type: { notIn: ["PRELUDE", "POSTLUDE"] } },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
    expect(analyzeChapter).toHaveBeenCalledTimes(2);
    expect(chapterUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "chapter-1" },
      data : { parseStatus: "SUCCEEDED" }
    }));
    expect(bookUpdateMany).toHaveBeenCalledTimes(2);
    expect(bookUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id           : "book-1",
        parseProgress: expect.objectContaining({ lt: expect.any(Number) })
      }),
      data: expect.objectContaining({
        parseProgress: expect.any(Number),
        parseStage   : expect.stringContaining("实体提取（已完成")
      })
    }));
    // 章节循环不再使用事务；仅在任务收尾时使用一次事务提交 job/book 终态。
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data : expect.objectContaining({
        status: AnalysisJobStatus.SUCCEEDED
      })
    });
  });

  it("creates analysis run and orchestration stage runs around a successful job", async () => {
    const jobId = "job-observable";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      prismaMock
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.QUEUED,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await runner.runAnalysisJobById(jobId);

    expect(prismaMock.analysisRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        jobId,
        bookId,
        trigger: "ANALYSIS_JOB",
        scope  : "FULL_BOOK",
        status : AnalysisJobStatus.RUNNING
      }),
      select: { id: true }
    });
    expect(prismaMock.analysisStageRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId     : "run-observable",
        bookId,
        stageKey  : "JOB_CHAPTER_SELECTION",
        inputCount: 0
      }),
      select: { id: true }
    });
    expect(prismaMock.analysisStageRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId         : "run-observable",
        bookId,
        stageKey      : "PIPELINE_SEQUENTIAL",
        inputCount    : 1,
        chapterStartNo: 1,
        chapterEndNo  : 1
      }),
      select: { id: true }
    });
    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-observable" },
      data : expect.objectContaining({
        status     : AnalysisStageRunStatus.SUCCEEDED,
        outputCount: 1
      })
    });
    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-observable" },
      data : expect.objectContaining({
        status         : AnalysisJobStatus.SUCCEEDED,
        currentStageKey: null
      })
    });
  });

  it("marks the orchestration stage and analysis run failed when chapter selection fails", async () => {
    const jobId = "job-observable-fail";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      prismaMock
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.QUEUED,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      });
    chapterFindMany.mockResolvedValueOnce([]);

    await expect(runner.runAnalysisJobById(jobId)).rejects.toThrow("未找到可执行章节");

    expect(prismaMock.analysisStageRun.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        runId     : "run-observable",
        bookId,
        stageKey  : "JOB_CHAPTER_SELECTION",
        inputCount: 0
      }),
      select: { id: true }
    });
    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-observable" },
      data : expect.objectContaining({
        status      : AnalysisStageRunStatus.FAILED,
        failureCount: 1,
        errorMessage: expect.stringContaining("未找到可执行章节")
      })
    });
    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-observable" },
      data : expect.objectContaining({
        status         : AnalysisJobStatus.FAILED,
        currentStageKey: null,
        errorMessage   : expect.stringContaining("未找到可执行章节")
      })
    });
  });

  it("keeps cancel semantics when all chapters fail after the job is canceled", async () => {
    const jobId = "job-observable-canceled";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analyzeChapter,
      analysisJobUpdate,
      prismaMock
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.CANCELED });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter.mockRejectedValueOnce(new Error("ai failed"));

    await expect(runner.runAnalysisJobById(jobId)).resolves.toBeUndefined();

    expect(prismaMock.analysisStageRun.update).toHaveBeenCalledWith({
      where: { id: "stage-run-observable" },
      data : expect.objectContaining({
        status      : AnalysisStageRunStatus.FAILED,
        failureCount: 1,
        errorClass  : "CANCELED"
      })
    });
    expect(prismaMock.analysisRun.update).toHaveBeenCalledWith({
      where: { id: "run-observable" },
      data : expect.objectContaining({
        status         : AnalysisJobStatus.CANCELED,
        currentStageKey: null
      })
    });
    expect(analysisJobUpdate).not.toHaveBeenCalledWith({
      where: { id: jobId },
      data : expect.objectContaining({
        status: AnalysisJobStatus.FAILED
      })
    });
  });

  // 用例语义：章节已成功落库时，进度写入异常不应中断整书任务。
  it("keeps job successful when incremental book progress write fails", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      bookUpdateMany,
      chapterUpdate,
      analysisJobUpdate
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-progress-write-fail",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-progress-write-fail",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    bookUpdateMany.mockRejectedValueOnce(new Error("transaction timed out"));

    await expect(runner.runAnalysisJobById("job-progress-write-fail")).resolves.toBeUndefined();

    expect(chapterUpdate).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data : { parseStatus: "SUCCEEDED" }
    });
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-progress-write-fail" },
      data : expect.objectContaining({
        status: AnalysisJobStatus.SUCCEEDED
      })
    });
  });

  it("persists threestage warning summaries into job and book error logs", async () => {
    const {
      analysisJobFindUnique,
      chapterFindMany,
      analysisJobUpdate,
      bookUpdate
    } = createRunnerContext();
    const mockPipelineRun = vi.fn().mockResolvedValue({
      completedChapters: 1,
      failedChapters   : 0,
      warnings         : [
        {
          code   : "PERSONA_ZERO_AFTER_STAGE_B",
          stage  : "STAGE_B",
          message: "Stage B finished without any promoted personas."
        }
      ],
      stageSummaries: [
        {
          stage  : "STAGE_B",
          status : "WARNING",
          metrics: { promotedPersonaCount: 0 }
        }
      ]
    });
    const runner = createAnalysisJobRunner({
      analysisJob: {
        findUnique: analysisJobFindUnique,
        findFirst : vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update    : analysisJobUpdate
      },
      chapter: { findMany: chapterFindMany, findUnique: vi.fn(), updateMany: vi.fn().mockResolvedValue({ count: 1 }), update: vi.fn() },
      book   : {
        findUnique: vi.fn().mockResolvedValue({ title: "儒林外史" }),
        update    : bookUpdate,
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      profile     : { findMany: vi.fn().mockResolvedValue([]) },
      mention     : { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      relationship: { findMany: vi.fn().mockResolvedValue([]) },
      persona     : { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      analysisRun : {
        create   : vi.fn().mockResolvedValue({ id: "run-warning-test" }),
        update   : vi.fn().mockResolvedValue({}),
        findFirst: vi.fn().mockResolvedValue(null)
      },
      analysisStageRun: {
        create: vi.fn().mockResolvedValue({ id: "stage-run-warning-test" }),
        update: vi.fn().mockResolvedValue({})
      },
      llmRawOutput: {
        aggregate: vi.fn().mockResolvedValue({
          _sum: { promptTokens: 0, completionTokens: 0, totalTokens: 0, estimatedCostMicros: BigInt(0) }
        }),
        create: vi.fn().mockResolvedValue({ id: "raw-warning-test" })
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => await Promise.all(ops))
    } as never, {
      analyzeChapter          : vi.fn(),
      resolvePersonaTitles    : vi.fn().mockResolvedValue(0),
      getTitleOnlyPersonaCount: vi.fn().mockResolvedValue(0),
      validateChapterResult   : vi.fn(),
      runGrayZoneArbitration  : vi.fn().mockResolvedValue(0)
    }, undefined, (architecture) => ({
      architecture,
      run: mockPipelineRun
    }), {
      writeSequentialReviewOutput: vi.fn().mockResolvedValue({}),
      rebuildReviewProjection    : vi.fn().mockResolvedValue({})
    });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-threestage-warning",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-threestage-warning",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await runner.runAnalysisJobById("job-threestage-warning");

    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-threestage-warning" },
      data : expect.objectContaining({
        status  : AnalysisJobStatus.SUCCEEDED,
        errorLog: expect.stringContaining("PERSONA_ZERO_AFTER_STAGE_B")
      })
    });
    expect(bookUpdate).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status  : "COMPLETED",
        errorLog: expect.stringContaining("PERSONA_ZERO_AFTER_STAGE_B")
      })
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when job does not exist", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany } = createRunnerContext();
    analysisJobFindUnique.mockResolvedValueOnce(null);

    await expect(runner.runAnalysisJobById("missing-job")).rejects.toThrow("解析任务不存在: missing-job");
    expect(chapterFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns early for terminal jobs", async () => {
    const { runner, analysisJobFindUnique, analysisJobUpdateMany } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id          : "job-s",
        bookId      : "book-1",
        status      : AnalysisJobStatus.SUCCEEDED,
        architecture: "sequential",
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-c",
        bookId      : "book-1",
        status      : AnalysisJobStatus.CANCELED,
        architecture: "sequential",
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });

    await runner.runAnalysisJobById("job-s");
    await runner.runAnalysisJobById("job-c");
    expect(analysisJobUpdateMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns when queued job claim loses race", async () => {
    const {
      runner,
      analysisJobFindUnique,
      analysisJobUpdateMany,
      chapterFindMany
    } = createRunnerContext();

    analysisJobFindUnique.mockResolvedValueOnce({
      id          : "job-claim",
      bookId      : "book-1",
      status      : AnalysisJobStatus.QUEUED,
      architecture: "sequential",
      scope       : "FULL_BOOK",
      chapterStart: null,
      chapterEnd  : null
    });
    analysisJobUpdateMany.mockResolvedValueOnce({ count: 0 });

    await runner.runAnalysisJobById("job-claim");
    expect(chapterFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns when job is no longer running after claim", async () => {
    const {
      runner,
      analysisJobFindUnique,
      analysisJobUpdateMany,
      chapterFindMany
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id          : "job-refresh",
        bookId      : "book-1",
        status      : AnalysisJobStatus.QUEUED,
        architecture: "sequential",
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-refresh",
        bookId      : "book-1",
        status      : AnalysisJobStatus.FAILED,
        architecture: "sequential",
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });
    analysisJobUpdateMany.mockResolvedValueOnce({ count: 1 });

    await runner.runAnalysisJobById("job-refresh");
    expect(chapterFindMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when chapter range job has invalid bounds", async () => {
    const { runner, analysisJobFindUnique } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id          : "job-range-invalid",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope       : "CHAPTER_RANGE",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-range-invalid",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope       : "CHAPTER_RANGE",
        chapterStart: null,
        chapterEnd  : null
      });

    await expect(runner.runAnalysisJobById("job-range-invalid")).rejects.toThrow("章节范围无效");
  });

  it("fails CHAPTER_LIST job when chapterIndices is empty", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analysisJobUpdate,
      bookUpdate
    } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-empty-list",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "CHAPTER_LIST",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-empty-list",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "CHAPTER_LIST",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      });

    await expect(runner.runAnalysisJobById("job-empty-list")).rejects.toThrow("章节列表为空");

    expect(chapterFindMany).not.toHaveBeenCalled();
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-empty-list" },
      data : expect.objectContaining({
        status  : AnalysisJobStatus.FAILED,
        errorLog: expect.stringContaining("章节列表为空")
      })
    });
    expect(bookUpdate).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status    : "ERROR",
        parseStage: "解析失败"
      })
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks job and book as failed when no chapters can be loaded", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analysisJobUpdate,
      bookUpdate,
      transaction
    } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id          : "job-empty-chapters",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-empty-chapters",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });
    chapterFindMany.mockResolvedValueOnce([]);

    await expect(runner.runAnalysisJobById("job-empty-chapters")).rejects.toThrow("未找到可执行章节");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-empty-chapters" },
      data : expect.objectContaining({
        status: AnalysisJobStatus.FAILED
      })
    });
    expect(bookUpdate).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status       : "ERROR",
        parseProgress: 0,
        parseStage   : "解析失败"
      })
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks job and book as failed when chapter analyzer throws", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analyzeChapter,
      analysisJobUpdate,
      bookUpdate,
      transaction
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-failed",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-failed",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING }); // pipeline 收尾前再次检查取消状态
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter.mockRejectedValueOnce(new Error("ai failed"));

    // 单章全部失败时，任务整体失败并抛出汇总错误
    await expect(runner.runAnalysisJobById("job-failed")).rejects.toThrow("所有章节解析失败");
    // 章节循环不再使用事务；失败时仅在 catch 收尾事务里写一次 FAILED/ERROR。
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-failed" },
      data : expect.objectContaining({
        status  : AnalysisJobStatus.FAILED,
        errorLog: expect.stringContaining("所有章节解析失败")
      })
    });
    expect(bookUpdate).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status       : "ERROR",
        parseProgress: 0,
        parseStage   : "解析失败",
        errorLog     : expect.stringContaining("所有章节解析失败")
      })
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("skips PRELUDE and POSTLUDE chapters in FULL_BOOK scope", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany, analyzeChapter } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-skip",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-skip",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    // DB 过滤后仅返回 CHAPTER 类型
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-2", no: 2 }]);

    await runner.runAnalysisJobById("job-skip");

    // 确认查询参数含有 type 过滤
    expect(chapterFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          type: { notIn: ["PRELUDE", "POSTLUDE"] }
        })
      })
    );
    // 只解析被返回的 1 章（模拟 DB 已过滤掉前言）
    expect(analyzeChapter).toHaveBeenCalledTimes(1);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runs chapter range jobs with gte/lte filters", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany, analyzeChapter } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id          : "job-range",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope       : "CHAPTER_RANGE",
        chapterStart: 2,
        chapterEnd  : 3
      })
      .mockResolvedValueOnce({
        id          : "job-range",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        architecture: "sequential",
        scope       : "CHAPTER_RANGE",
        chapterStart: 2,
        chapterEnd  : 3
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-2", no: 2 },
      { id: "chapter-3", no: 3 }
    ]);

    await runner.runAnalysisJobById("job-range");
    expect(chapterFindMany).toHaveBeenCalledWith({
      where: {
        bookId: "book-1",
        type  : { notIn: ["PRELUDE", "POSTLUDE"] },
        no    : {
          gte: 2,
          lte: 3
        }
      },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
    expect(analyzeChapter).toHaveBeenCalledTimes(2);
  });

  it("runs chapter list jobs with in filters", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany, analyzeChapter } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-list",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "CHAPTER_LIST",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: [2, 4]
      })
      .mockResolvedValueOnce({
        id            : "job-list",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "CHAPTER_LIST",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: [2, 4]
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-2", no: 2 },
      { id: "chapter-4", no: 4 }
    ]);

    await runner.runAnalysisJobById("job-list");

    expect(chapterFindMany).toHaveBeenCalledWith({
      where: {
        bookId: "book-1",
        type  : { notIn: ["PRELUDE", "POSTLUDE"] },
        no    : { in: [2, 4] }
      },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
    expect(analyzeChapter).toHaveBeenCalledTimes(2);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runs incremental title resolution every 5 chapters during chapter loop", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany, resolvePersonaTitles, getTitleOnlyPersonaCount } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-incremental",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-incremental",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-1", no: 1 },
      { id: "chapter-2", no: 2 },
      { id: "chapter-3", no: 3 },
      { id: "chapter-4", no: 4 },
      { id: "chapter-5", no: 5 },
      { id: "chapter-6", no: 6 }
    ]);

    getTitleOnlyPersonaCount.mockResolvedValue(3);
    await runner.runAnalysisJobById("job-incremental");
    // 第 5 章触发一次增量溯源 + FULL_BOOK 完成后再触发一次终态溯源。
    expect(resolvePersonaTitles).toHaveBeenCalledTimes(2);
    expect(resolvePersonaTitles).toHaveBeenCalledWith("book-1", { jobId: "job-incremental" });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runs gray-zone arbitration once after full book processing", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany, runGrayZoneArbitration } = createRunnerContext();
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-gray-zone",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-gray-zone",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    runGrayZoneArbitration.mockResolvedValueOnce(2);

    await runner.runAnalysisJobById("job-gray-zone");
    expect(runGrayZoneArbitration).toHaveBeenCalledTimes(1);
    expect(runGrayZoneArbitration).toHaveBeenCalledWith("book-1", { jobId: "job-gray-zone" });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runs full-book validation and applies auto fixes when report is auto-fixable", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      validateBookResult,
      applyAutoFixes
    } = createRunnerContext({ withValidation: true });
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-validation",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    validateBookResult.mockResolvedValueOnce({
      id     : "report-1",
      issues : [],
      summary: {
        totalIssues : 1,
        errorCount  : 0,
        warningCount: 1,
        infoCount   : 0,
        autoFixable : 1,
        needsReview : 0
      }
    });
    applyAutoFixes.mockResolvedValueOnce(1);

    await runner.runAnalysisJobById("job-validation");
    expect(validateBookResult).toHaveBeenCalledWith("book-1", "job-validation");
    expect(applyAutoFixes).toHaveBeenCalledWith("report-1");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not abort whole job when chapter validation reports errors", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      validateChapterResult,
      chapterUpdate,
      analysisJobUpdate,
      analyzeChapter
    } = createRunnerContext({ withValidation: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-validation-errors",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-errors",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    // 模拟高风险章节（新建 persona >= 风险阈值），确保触发 CHAPTER_VALIDATION。
    analyzeChapter.mockResolvedValueOnce({
      chapterId         : "chapter-1",
      chunkCount        : 1,
      hallucinationCount: 0,
      created           : { personas: 5, mentions: 3, biographies: 2, relationships: 1 }
    });
    validateChapterResult.mockResolvedValueOnce({
      id     : "chapter-r-1",
      issues : [{ id: "i1" }],
      summary: {
        totalIssues : 1,
        errorCount  : 1,
        warningCount: 0,
        infoCount   : 0,
        autoFixable : 0,
        needsReview : 1
      }
    });

    await expect(runner.runAnalysisJobById("job-validation-errors")).resolves.toBeUndefined();
    expect(chapterUpdate).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data : { parseStatus: "REVIEW_PENDING" }
    });
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-validation-errors" },
      data : expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
    });
  });

  it("builds chapter validation payload with fallback defaults from database rows", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analyzeChapter,
      validateChapterResult,
      personaFindMany,
      mentionFindMany,
      relationshipFindMany,
      profileFindMany
    } = createRunnerContext({ withValidation: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-validation-fallbacks",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-fallbacks",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter.mockResolvedValueOnce({
      chapterId         : "chapter-1",
      chunkCount        : 1,
      hallucinationCount: 0,
      created           : { personas: 3, mentions: 1, biographies: 1, relationships: 1 }
    });
    personaFindMany
      .mockResolvedValueOnce([
        {
          id        : "persona-new",
          name      : "王五",
          confidence: null,
          nameType  : null
        }
      ])
      .mockResolvedValueOnce([
        { id: "persona-new", name: "王五" },
        { id: "persona-related", name: "李四" }
      ]);
    mentionFindMany.mockResolvedValueOnce([
      { personaId: "persona-missing", rawText: "陌生人" }
    ]);
    relationshipFindMany.mockResolvedValueOnce([
      { sourceId: "persona-related", targetId: "persona-missing", type: "RIVAL" }
    ]);
    profileFindMany.mockResolvedValueOnce([
      {
        personaId   : "persona-profile",
        localName   : "本地称谓",
        localSummary: "只在地方志出现",
        persona     : { name: undefined, aliases: "not-an-array" } as never
      }
    ]);

    await expect(runner.runAnalysisJobById("job-validation-fallbacks")).resolves.toBeUndefined();

    expect(validateChapterResult).toHaveBeenCalledWith(expect.objectContaining({
      bookId     : "book-1",
      chapterId  : "chapter-1",
      chapterNo  : 1,
      jobId      : "job-validation-fallbacks",
      newPersonas: [{
        id        : "persona-new",
        name      : "王五",
        confidence: 0.5,
        nameType  : "NAMED"
      }],
      newMentions: [{
        personaId: "persona-missing",
        rawText  : "persona-missing: 陌生人"
      }],
      newRelationships: [{
        sourceId: "persona-related",
        targetId: "persona-missing",
        type    : "RIVAL"
      }],
      existingProfiles: [{
        personaId    : "persona-profile",
        canonicalName: "本地称谓",
        aliases      : [],
        localSummary : "只在地方志出现"
      }]
    }));
  });

  it("treats gray-zone titles as high risk and runs chapter validation", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analyzeChapter,
      validateChapterResult,
      chapterUpdate
    } = createRunnerContext({ withValidation: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-gray-zone-risk",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-gray-zone-risk",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter.mockResolvedValueOnce({
      chapterId         : "chapter-1",
      chunkCount        : 1,
      hallucinationCount: 0,
      grayZoneCount     : 2,
      created           : { personas: 1, mentions: 1, biographies: 1, relationships: 0 }
    });

    await expect(runner.runAnalysisJobById("job-gray-zone-risk")).resolves.toBeUndefined();

    expect(validateChapterResult).toHaveBeenCalledTimes(1);
    expect(chapterUpdate).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data : { parseStatus: "SUCCEEDED" }
    });
  });

  it("degrades chapter validation when validation keeps throwing", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      validateChapterResult,
      chapterUpdate,
      analysisJobUpdate,
      analyzeChapter
    } = createRunnerContext({ withValidation: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-validation-degraded",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-degraded",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter.mockResolvedValueOnce({
      chapterId         : "chapter-1",
      chunkCount        : 1,
      hallucinationCount: 0,
      grayZoneCount     : 0,
      created           : { personas: 4, mentions: 1, biographies: 1, relationships: 1 }
    });
    validateChapterResult
      .mockRejectedValueOnce(new Error("validation service unavailable"))
      .mockRejectedValueOnce(new Error("validation service unavailable"));

    await expect(runner.runAnalysisJobById("job-validation-degraded")).resolves.toBeUndefined();

    expect(validateChapterResult).toHaveBeenCalledTimes(2);
    expect(chapterUpdate).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data : { parseStatus: "REVIEW_PENDING" }
    });
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-validation-degraded" },
      data : expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not fail main job when full-book validation throws", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      validateBookResult,
      analysisJobUpdate
    } = createRunnerContext({ withValidation: true });
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-validation-warn",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-warn",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    validateBookResult.mockRejectedValueOnce(new Error("validation service unavailable"));

    await expect(runner.runAnalysisJobById("job-validation-warn")).resolves.toBeUndefined();
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-validation-warn" },
      data : expect.objectContaining({
        status: AnalysisJobStatus.SUCCEEDED
      })
    });
  });

  it("retries retryable chapter failures and eventually succeeds", async () => {
    vi.useFakeTimers();

    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      analyzeChapter,
      chapterUpdate,
      analysisJobUpdate
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-retry",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-retry",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        chapterId         : "chapter-1",
        chunkCount        : 1,
        hallucinationCount: 0,
        created           : { personas: 1, mentions: 1, biographies: 1, relationships: 1 }
      });

    const runPromise = runner.runAnalysisJobById("job-retry");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(runPromise).resolves.toBeUndefined();

    expect(analyzeChapter).toHaveBeenCalledTimes(2);
    expect(chapterUpdate).toHaveBeenCalledWith({
      where: { id: "chapter-1" },
      data : { parseStatus: "SUCCEEDED" }
    });
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-retry" },
      data : expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
    });
  });


  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runNextAnalysisJob prioritizes recoverable running job", async () => {
    const {
      runner,
      analysisJobFindFirst,
      analysisJobFindUnique,
      chapterFindMany
    } = createRunnerContext();

    analysisJobFindFirst.mockResolvedValueOnce({ id: "running-job" });
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "running-job",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "running-job",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await expect(runner.runNextAnalysisJob()).resolves.toBe("running-job");
    expect(analysisJobFindFirst).toHaveBeenCalledTimes(1);
    expect(analysisJobFindFirst).toHaveBeenCalledWith({
      where: {
        status    : AnalysisJobStatus.RUNNING,
        finishedAt: null
      },
      orderBy: { updatedAt: "asc" },
      select : { id: true }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("runNextAnalysisJob falls back to queued job and returns null when no jobs", async () => {
    const {
      runner,
      analysisJobFindFirst,
      analysisJobFindUnique,
      analysisJobUpdateMany,
      chapterFindMany
    } = createRunnerContext();

    analysisJobFindFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "queued-job" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null);
    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "queued-job",
        bookId        : "book-1",
        status        : AnalysisJobStatus.QUEUED,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "queued-job",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING });
    analysisJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await expect(runner.runNextAnalysisJob()).resolves.toBe("queued-job");
    await expect(runner.runNextAnalysisJob()).resolves.toBeNull();
  });

  // review output / projection rebuild 测试组
  it("sequential FULL_BOOK job writes sequential review output and rebuilds projection before job is marked succeeded", async () => {
    const jobId = "job-review-output";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      analysisJobUpdate,
      chapterFindMany,
      writeSequentialReviewOutput,
      rebuildReviewProjection
    } = createRunnerContext();

    const calls: string[] = [];
    writeSequentialReviewOutput.mockImplementation(async () => { calls.push("review-output"); });
    rebuildReviewProjection.mockImplementation(async () => { calls.push("projection"); });
    analysisJobUpdate.mockImplementation(async (args: { data?: { status?: unknown } }) => {
      if (args.data?.status === AnalysisJobStatus.SUCCEEDED) {
        calls.push("job-succeeded");
      }
      return {};
    });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await runner.runAnalysisJobById(jobId);

    expect(writeSequentialReviewOutput).toHaveBeenCalledWith({
      bookId,
      runId     : "run-observable",
      chapterIds: ["chapter-1"]
    });
    expect(rebuildReviewProjection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId });
    expect(calls).toEqual(["review-output", "projection", "job-succeeded"]);
  });

  it("projection rebuild failure rejects and does not call analysisJob.update with SUCCEEDED", async () => {
    const jobId = "job-projection-fail";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      analysisJobUpdate,
      chapterFindMany,
      rebuildReviewProjection
    } = createRunnerContext();

    rebuildReviewProjection.mockRejectedValueOnce(new Error("projection rebuild failed"));

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await expect(runner.runAnalysisJobById(jobId)).rejects.toThrow("projection rebuild failed");
    expect(analysisJobUpdate).not.toHaveBeenCalledWith({
      where: { id: jobId },
      data : expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
    });
  });

  it("threestage job does NOT invoke sequential adapter but still rebuilds projection", async () => {
    const jobId = "job-threestage-projection";
    const bookId = "book-1";
    const {
      analysisJobFindUnique,
      chapterFindMany,
      analysisJobUpdate,
      writeSequentialReviewOutput,
      rebuildReviewProjection
    } = createRunnerContext();

    const mockPipelineRun = vi.fn().mockResolvedValue({
      completedChapters: 1,
      failedChapters   : 0,
      warnings         : [],
      stageSummaries   : []
    });
    const runner = createAnalysisJobRunner({
      analysisJob: {
        findUnique: analysisJobFindUnique,
        findFirst : vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update    : analysisJobUpdate
      },
      chapter: {
        findMany  : chapterFindMany,
        findUnique: vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        update    : vi.fn()
      },
      book: {
        findUnique: vi.fn().mockResolvedValue({ title: "儒林外史" }),
        update    : vi.fn(),
        updateMany: vi.fn().mockResolvedValue({ count: 1 })
      },
      profile            : { findMany: vi.fn().mockResolvedValue([]) },
      mention            : { groupBy: vi.fn().mockResolvedValue([]), findMany: vi.fn().mockResolvedValue([]) },
      relationship       : { findMany: vi.fn().mockResolvedValue([]) },
      persona            : { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      // threestage 架构触发 resolveThreeStageAiClient，需要提供策略配置相关 mock
      modelStrategyConfig: { findFirst: vi.fn().mockResolvedValue(null) },
      aiModel            : {
        findMany : vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue({
          id       : "model-mock",
          provider : "deepseek",
          name     : "DeepSeek Chat",
          modelId  : "deepseek-chat",
          baseUrl  : "https://api.deepseek.com",
          apiKey   : "sk-mock",
          isEnabled: true,
          isDefault: true,
          updatedAt: new Date()
        })
      },
      $transaction: vi.fn(async (ops: Promise<unknown>[]) => await Promise.all(ops))
    } as never, {
      analyzeChapter          : vi.fn(),
      resolvePersonaTitles    : vi.fn().mockResolvedValue(0),
      getTitleOnlyPersonaCount: vi.fn().mockResolvedValue(0),
      validateChapterResult   : vi.fn(),
      runGrayZoneArbitration  : vi.fn().mockResolvedValue(0)
    }, undefined, (_architecture: unknown) => ({
      architecture: "threestage",
      run         : mockPipelineRun
    }), {
      writeSequentialReviewOutput,
      rebuildReviewProjection
    });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "threestage",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "threestage",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await runner.runAnalysisJobById(jobId);

    expect(writeSequentialReviewOutput).not.toHaveBeenCalled();
    expect(rebuildReviewProjection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId });
  });

  // 用例语义：CHAPTER_RANGE 局部重跑后，只写入被选中章节的 review output，
  // 但 projection 仍须以 FULL_BOOK 视角重建，合并未触及章节的现有认领。
  it("CHAPTER_RANGE sequential job writes review output for selected chapters and rebuilds FULL_BOOK projection", async () => {
    const jobId = "job-range-review";
    const bookId = "book-1";
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      writeSequentialReviewOutput,
      rebuildReviewProjection
    } = createRunnerContext();

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "CHAPTER_RANGE",
        chapterStart  : 2,
        chapterEnd    : 3,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "CHAPTER_RANGE",
        chapterStart  : 2,
        chapterEnd    : 3,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-2", no: 2 },
      { id: "chapter-3", no: 3 }
    ]);

    await runner.runAnalysisJobById(jobId);

    // sequential adapter 仅对被选中的章节（第 2、3 章）写入 review output
    expect(writeSequentialReviewOutput).toHaveBeenCalledWith({
      bookId,
      runId     : "run-observable",
      chapterIds: ["chapter-2", "chapter-3"]
    });
    // 局部重跑后仍以 FULL_BOOK 视角重建整书 projection，保证审核中心视图一致
    expect(rebuildReviewProjection).toHaveBeenCalledWith({ kind: "FULL_BOOK", bookId });
  });

  it("sequential job rejects and does not mark SUCCEEDED when analysisRunId is null", async () => {
    const jobId = "job-null-run-id";
    const bookId = "book-1";
    const {
      runner,
      prismaMock,
      analysisJobFindUnique,
      analysisJobUpdate,
      chapterFindMany,
      writeSequentialReviewOutput
    } = createRunnerContext();

    // analysisRun.create が null の id を返すことで createJobRun が { id: null } を返す
    prismaMock.analysisRun.create.mockResolvedValueOnce({ id: null });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await expect(runner.runAnalysisJobById(jobId)).rejects.toThrow(
      `解析任务 ${jobId} 缺少 analysisRunId，无法生成审核输出`
    );
    expect(writeSequentialReviewOutput).not.toHaveBeenCalled();
    expect(analysisJobUpdate).not.toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED }) })
    );
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("markOrphanPersonas", () => {
  function createMockPrisma({
    profiles = [] as { personaId: string }[],
    mentionGroups = [] as { personaId: string; _count: { id: number } }[],
    updateManyResult = { count: 0 }
  } = {}) {
    const profileFindMany = vi.fn().mockResolvedValue(profiles);
    const mentionGroupBy = vi.fn().mockResolvedValue(mentionGroups);
    const personaUpdateMany = vi.fn().mockResolvedValue(updateManyResult);
    const prismaClient = {
      profile: { findMany: profileFindMany },
      mention: { groupBy: mentionGroupBy },
      persona: { updateMany: personaUpdateMany }
    } as never;
    return { prismaClient, profileFindMany, mentionGroupBy, personaUpdateMany };
  }

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 0 immediately when no profiles found for book", async () => {
    const { prismaClient, mentionGroupBy, personaUpdateMany } = createMockPrisma();
    const count = await markOrphanPersonas(prismaClient, "book-empty");
    expect(count).toBe(0);
    expect(mentionGroupBy).not.toHaveBeenCalled();
    expect(personaUpdateMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks personas with 0 mentions as orphans", async () => {
    const { prismaClient, personaUpdateMany } = createMockPrisma({
      profiles     : [{ personaId: "p-1" }, { personaId: "p-2" }],
      mentionGroups: [] // 两个 persona 均无提及
    });

    const count = await markOrphanPersonas(prismaClient, "book-1");
    expect(count).toBe(2);
    expect(personaUpdateMany).toHaveBeenCalledWith({
      where: {
        id        : { in: ["p-1", "p-2"] },
        confidence: { gt: 0.4 }
      },
      data: { confidence: 0.4 }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks personas with exactly 1 mention as orphans", async () => {
    const { prismaClient, personaUpdateMany } = createMockPrisma({
      profiles     : [{ personaId: "p-1" }, { personaId: "p-2" }],
      mentionGroups: [{ personaId: "p-1", _count: { id: 1 } }]
    });

    const count = await markOrphanPersonas(prismaClient, "book-1");
    expect(count).toBe(2); // 两者均 < 2
    expect(personaUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: { in: expect.arrayContaining(["p-1", "p-2"]) } })
      })
    );
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not mark personas with 2+ mentions as orphans", async () => {
    const { prismaClient, personaUpdateMany } = createMockPrisma({
      profiles     : [{ personaId: "p-1" }, { personaId: "p-2" }],
      mentionGroups: [
        { personaId: "p-1", _count: { id: 5 } },
        { personaId: "p-2", _count: { id: 2 } }
      ]
    });

    const count = await markOrphanPersonas(prismaClient, "book-1");
    expect(count).toBe(0);
    expect(personaUpdateMany).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("skips update when all orphans already have confidence <= 0.4", async () => {
    // personaUpdateMany 的 where 条件 confidence > 0.4 会在 DB 侧过滤，这里仅验证调用参数正确。
    const { prismaClient, personaUpdateMany } = createMockPrisma({
      profiles        : [{ personaId: "p-low" }],
      updateManyResult: { count: 0 }
    });

    const count = await markOrphanPersonas(prismaClient, "book-1");
    expect(count).toBe(1);
    expect(personaUpdateMany).toHaveBeenCalledWith({
      where: {
        id        : { in: ["p-low"] },
        confidence: { gt: 0.4 }
      },
      data: { confidence: 0.4 }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("only queries mentions for personas in this book", async () => {
    const { prismaClient, mentionGroupBy } = createMockPrisma({
      profiles: [{ personaId: "p-a" }, { personaId: "p-b" }]
    });

    await markOrphanPersonas(prismaClient, "book-xyz");
    expect(mentionGroupBy).toHaveBeenCalledWith({
      by   : ["personaId"],
      where: {
        personaId: { in: ["p-a", "p-b"] },
        deletedAt: null,
        chapter  : { bookId: "book-xyz" }
      },
      _count: { id: true }
    });
  });
});
