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

import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildAliasLookupFromDb, loadAnalysisRuntimeConfig } from "@/server/modules/knowledge/load-book-knowledge";
import { createAnalysisJobRunner, markOrphanPersonas } from "@/server/modules/analysis/jobs/runAnalysisJob";

vi.mock("@/server/modules/knowledge/load-book-knowledge", () => ({
  buildAliasLookupFromDb   : vi.fn(),
  loadAnalysisRuntimeConfig: vi.fn()
}));

function createRunnerContext(options: { withValidation?: boolean; withTwoPass?: boolean } = {}) {
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
      return await operationsOrCallback({} as never);
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
  const extractChapterEntities = vi.fn().mockImplementation(async (chapterId: string) => ({
    chapterId,
    chapterNo: Number(chapterId.split("-").at(-1) ?? 1),
    entities : []
  }));
  const resolveGlobalEntities = vi.fn().mockResolvedValue({
    globalPersonaMap: new Map<string, string>([["范进", "persona-existing"]])
  });
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

  const runGrayZoneArbitration = vi.fn().mockResolvedValue(0);
  const chapterAnalyzer = options.withValidation
    ? { analyzeChapter, resolvePersonaTitles, getTitleOnlyPersonaCount, runGrayZoneArbitration, validateChapterResult, validateBookResult, applyAutoFixes }
    : { analyzeChapter, resolvePersonaTitles, getTitleOnlyPersonaCount, runGrayZoneArbitration, validateChapterResult };
  const resolvedChapterAnalyzer = options.withTwoPass
    ? { ...chapterAnalyzer, extractChapterEntities, resolveGlobalEntities }
    : chapterAnalyzer;

  const runner = createAnalysisJobRunner({
    analysisJob: {
      findUnique: analysisJobFindUnique,
      findFirst : analysisJobFindFirst,
      updateMany: analysisJobUpdateMany,
      update    : analysisJobUpdate
    },
    chapter     : { findMany: chapterFindMany, findUnique: chapterFindUnique, updateMany: chapterUpdateMany, update: chapterUpdate },
    book        : { findUnique: bookFindUnique, update: bookUpdate, updateMany: bookUpdateMany },
    profile     : { findMany: profileFindMany },
    mention     : { groupBy: mentionGroupBy, findMany: mentionFindMany },
    relationship: { findMany: relationshipFindMany },
    persona     : { findMany: personaFindMany, updateMany: personaUpdateMany },
    $transaction: transaction
  } as never, resolvedChapterAnalyzer as never);

  return {
    runner,
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
    extractChapterEntities,
    resolveGlobalEntities,
    validateBookResult,
    validateChapterResult,
    applyAutoFixes,
    runGrayZoneArbitration,
    profileFindMany,
    mentionGroupBy,
    mentionFindMany,
    relationshipFindMany,
    personaFindMany,
    personaUpdateMany
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("analysis job runner", () => {
  const mockedBuildAliasLookupFromDb = vi.mocked(buildAliasLookupFromDb);
  const mockedLoadAnalysisRuntimeConfig = vi.mocked(loadAnalysisRuntimeConfig);

  beforeEach(() => {
    vi.clearAllMocks();
    mockedBuildAliasLookupFromDb.mockResolvedValue(new Map());
    mockedLoadAnalysisRuntimeConfig.mockResolvedValue({});
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : jobId,
        bookId,
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-progress-write-fail",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
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
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-c",
        bookId      : "book-1",
        status      : AnalysisJobStatus.CANCELED,
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
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-refresh",
        bookId      : "book-1",
        status      : AnalysisJobStatus.FAILED,
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
        scope       : "CHAPTER_RANGE",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-range-invalid",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
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
        scope         : "CHAPTER_LIST",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-empty-list",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-empty-chapters",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-failed",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({ status: AnalysisJobStatus.RUNNING }); // cancel check
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-skip",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope       : "CHAPTER_RANGE",
        chapterStart: 2,
        chapterEnd  : 3
      })
      .mockResolvedValueOnce({
        id          : "job-range",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
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
        scope         : "CHAPTER_LIST",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: [2, 4]
      })
      .mockResolvedValueOnce({
        id            : "job-list",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-incremental",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-gray-zone",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-errors",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-fallbacks",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-gray-zone-risk",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-degraded",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-validation-warn",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-retry",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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

  it("runs two-pass extraction and injects preloaded knowledge into chapter analysis", async () => {
    const aliasLookup = new Map<string, string>([["范老爷", "范进"]]);
    const preloadedLexiconConfig = {
      entityExtractionRules: ["提取历史人物真名"]
    };
    const globalPersonaMap = new Map<string, string>([["范进", "persona-fan"]]);

    mockedBuildAliasLookupFromDb.mockResolvedValueOnce(aliasLookup);
    mockedLoadAnalysisRuntimeConfig.mockResolvedValueOnce(preloadedLexiconConfig);

    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      bookFindUnique,
      extractChapterEntities,
      resolveGlobalEntities,
      analyzeChapter,
      analysisJobUpdate
    } = createRunnerContext({ withTwoPass: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-two-pass",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-two-pass",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-1", no: 1 },
      { id: "chapter-2", no: 2 }
    ]);
    bookFindUnique.mockResolvedValueOnce({
      title     : "儒林外史",
      genre     : "历史演义",
      bookTypeId: null,
      bookType  : null
    });
    resolveGlobalEntities.mockResolvedValueOnce({ globalPersonaMap });
    analyzeChapter.mockImplementation(async (_chapterId, context) => {
      expect(context).toMatchObject({
        jobId             : "job-two-pass",
        externalPersonaMap: globalPersonaMap,
        preloadedLexiconConfig
      });
      return {
        chapterId         : "chapter-1",
        chunkCount        : 1,
        hallucinationCount: 0,
        created           : { personas: 1, mentions: 1, biographies: 1, relationships: 1 }
      };
    });

    await expect(runner.runAnalysisJobById("job-two-pass")).resolves.toBeUndefined();

    expect(extractChapterEntities).toHaveBeenCalledTimes(2);
    expect(resolveGlobalEntities).toHaveBeenCalledWith(
      "book-1",
      "儒林外史",
      [
        { chapterId: "chapter-1", chapterNo: 1, entities: [] },
        { chapterId: "chapter-2", chapterNo: 2, entities: [] }
      ],
      { bookId: "book-1", jobId: "job-two-pass" },
      aliasLookup
    );
    expect(mockedBuildAliasLookupFromDb).toHaveBeenCalledWith("book-1", "历史演义", expect.any(Object));
    expect(mockedLoadAnalysisRuntimeConfig).toHaveBeenCalledWith("历史演义", expect.any(Object));
    expect(analyzeChapter).toHaveBeenCalledTimes(2);
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-two-pass" },
      data : expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
    });
  });

  it("stops pass-one retries immediately for non-retryable extraction errors", async () => {
    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      bookFindUnique,
      extractChapterEntities,
      resolveGlobalEntities,
      analysisJobUpdate
    } = createRunnerContext({ withTwoPass: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-two-pass-non-retryable",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-two-pass-non-retryable",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    bookFindUnique.mockResolvedValueOnce({
      title     : "儒林外史",
      genre     : "历史演义",
      bookTypeId: null,
      bookType  : null
    });
    extractChapterEntities.mockRejectedValueOnce(new Error("schema mismatch"));

    await expect(runner.runAnalysisJobById("job-two-pass-non-retryable")).resolves.toBeUndefined();

    expect(extractChapterEntities).toHaveBeenCalledTimes(1);
    expect(resolveGlobalEntities).toHaveBeenCalledWith(
      "book-1",
      "儒林外史",
      [],
      { bookId: "book-1", jobId: "job-two-pass-non-retryable" },
      expect.any(Map)
    );
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-two-pass-non-retryable" },
      data : expect.objectContaining({ status: AnalysisJobStatus.SUCCEEDED })
    });
  });

  it("retries retryable pass-one extraction errors before continuing", async () => {
    vi.useFakeTimers();

    const {
      runner,
      analysisJobFindUnique,
      chapterFindMany,
      bookFindUnique,
      extractChapterEntities,
      resolveGlobalEntities,
      analysisJobUpdate
    } = createRunnerContext({ withTwoPass: true });

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id            : "job-two-pass-retry",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "job-two-pass-retry",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValue({ status: AnalysisJobStatus.RUNNING });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    bookFindUnique.mockResolvedValueOnce({
      title     : "儒林外史",
      genre     : "历史演义",
      bookTypeId: null,
      bookType  : null
    });
    extractChapterEntities
      .mockRejectedValueOnce(new Error("network timeout"))
      .mockResolvedValueOnce({
        chapterId: "chapter-1",
        chapterNo: 1,
        entities : [{ id: "entity-1", name: "范进" }]
      });

    const runPromise = runner.runAnalysisJobById("job-two-pass-retry");
    await vi.advanceTimersByTimeAsync(3000);
    await expect(runPromise).resolves.toBeUndefined();

    expect(extractChapterEntities).toHaveBeenCalledTimes(2);
    expect(resolveGlobalEntities).toHaveBeenCalledWith(
      "book-1",
      "儒林外史",
      [{
        chapterId: "chapter-1",
        chapterNo: 1,
        entities : [{ id: "entity-1", name: "范进" }]
      }],
      { bookId: "book-1", jobId: "job-two-pass-retry" },
      expect.any(Map)
    );
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-two-pass-retry" },
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "running-job",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: []
      })
      .mockResolvedValueOnce({
        id            : "queued-job",
        bookId        : "book-1",
        status        : AnalysisJobStatus.RUNNING,
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
