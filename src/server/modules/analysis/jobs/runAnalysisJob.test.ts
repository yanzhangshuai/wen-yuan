import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisJobRunner, markOrphanPersonas } from "@/server/modules/analysis/jobs/runAnalysisJob";

function createRunnerContext() {
  const analysisJobFindUnique = vi.fn();
  const analysisJobFindFirst = vi.fn();
  const analysisJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const analysisJobUpdate = vi.fn().mockResolvedValue({});
  const chapterFindMany = vi.fn().mockResolvedValue([]);
  const chapterUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const chapterUpdate = vi.fn().mockResolvedValue({});
  const bookUpdate = vi.fn().mockResolvedValue({});
  const transaction = vi.fn(async (operations: Promise<unknown>[]) => await Promise.all(operations));
  const analyzeChapter = vi.fn().mockResolvedValue({
    chapterId         : "chapter-1",
    chunkCount        : 1,
    hallucinationCount: 0,
    created           : { personas: 1, mentions: 1, biographies: 1, relationships: 1 }
  });
  // Phase 5 真名溯源：默认返回 0（无 TITLE_ONLY persona），不影响既有测试断言。
  const resolvePersonaTitles = vi.fn().mockResolvedValue(0);
  // 孤儿检测所需：默认无档案 → 无孤儿，不影响既有测试断言。
  const profileFindMany = vi.fn().mockResolvedValue([]);
  const mentionGroupBy = vi.fn().mockResolvedValue([]);
  const personaUpdateMany = vi.fn().mockResolvedValue({ count: 0 });

  const runner = createAnalysisJobRunner({
    analysisJob: {
      findUnique: analysisJobFindUnique,
      findFirst : analysisJobFindFirst,
      updateMany: analysisJobUpdateMany,
      update    : analysisJobUpdate
    },
    chapter     : { findMany: chapterFindMany, updateMany: chapterUpdateMany, update: chapterUpdate },
    book        : { update: bookUpdate },
    profile     : { findMany: profileFindMany },
    mention     : { groupBy: mentionGroupBy },
    persona     : { updateMany: personaUpdateMany },
    $transaction: transaction
  } as never, { analyzeChapter, resolvePersonaTitles });

  return {
    runner,
    analysisJobFindUnique,
    analysisJobFindFirst,
    analysisJobUpdateMany,
    analysisJobUpdate,
    chapterFindMany,
    chapterUpdateMany,
    chapterUpdate,
    bookUpdate,
    transaction,
    analyzeChapter,
    resolvePersonaTitles,
    profileFindMany,
    mentionGroupBy,
    personaUpdateMany
  };
}

describe("analysis job runner", () => {
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
      analyzeChapter
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
    // 1 $transaction per chapter (book progress + chapter PROCESSING) + 1 final success
    expect(transaction).toHaveBeenCalledTimes(3);
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: jobId },
      data : expect.objectContaining({
        status: AnalysisJobStatus.SUCCEEDED
      })
    });
  });

  it("throws when job does not exist", async () => {
    const { runner, analysisJobFindUnique, chapterFindMany } = createRunnerContext();
    analysisJobFindUnique.mockResolvedValueOnce(null);

    await expect(runner.runAnalysisJobById("missing-job")).rejects.toThrow("解析任务不存在: missing-job");
    expect(chapterFindMany).not.toHaveBeenCalled();
  });

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
    // 1 $transaction per chapter (book+chapter PROCESSING) + 1 failure
    expect(transaction).toHaveBeenCalledTimes(2);
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

  it("returns 0 immediately when no profiles found for book", async () => {
    const { prismaClient, mentionGroupBy, personaUpdateMany } = createMockPrisma();
    const count = await markOrphanPersonas(prismaClient, "book-empty");
    expect(count).toBe(0);
    expect(mentionGroupBy).not.toHaveBeenCalled();
    expect(personaUpdateMany).not.toHaveBeenCalled();
  });

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
