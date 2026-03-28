import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisJobRunner } from "@/server/modules/analysis/jobs/runAnalysisJob";

function createRunnerContext() {
  const analysisJobFindUnique = vi.fn();
  const analysisJobFindFirst = vi.fn();
  const analysisJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const analysisJobUpdate = vi.fn().mockResolvedValue({});
  const chapterFindMany = vi.fn().mockResolvedValue([]);
  const bookUpdate = vi.fn().mockResolvedValue({});
  const transaction = vi.fn(async (operations: Promise<unknown>[]) => await Promise.all(operations));
  const analyzeChapter = vi.fn().mockResolvedValue({
    chapterId         : "chapter-1",
    chunkCount        : 1,
    hallucinationCount: 0,
    created           : { personas: 1, mentions: 1, biographies: 1, relationships: 1 }
  });

  const runner = createAnalysisJobRunner({
    analysisJob: {
      findUnique: analysisJobFindUnique,
      findFirst : analysisJobFindFirst,
      updateMany: analysisJobUpdateMany,
      update    : analysisJobUpdate
    },
    chapter     : { findMany: chapterFindMany },
    book        : { update: bookUpdate },
    $transaction: transaction
  } as never, { analyzeChapter });

  return {
    runner,
    analysisJobFindUnique,
    analysisJobFindFirst,
    analysisJobUpdateMany,
    analysisJobUpdate,
    chapterFindMany,
    bookUpdate,
    transaction,
    analyzeChapter
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

    analysisJobFindUnique
      .mockResolvedValueOnce({
        id          : jobId,
        bookId,
        status      : AnalysisJobStatus.QUEUED,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : jobId,
        bookId,
        status      : AnalysisJobStatus.RUNNING,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });
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
      where  : { bookId },
      orderBy: { no: "asc" },
      select : { id: true, no: true }
    });
    expect(analyzeChapter).toHaveBeenCalledTimes(2);
    expect(transaction).toHaveBeenCalledTimes(1);
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
        id          : "job-failed",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "job-failed",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);
    analyzeChapter.mockRejectedValueOnce(new Error("ai failed"));

    await expect(runner.runAnalysisJobById("job-failed")).rejects.toThrow("ai failed");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(analysisJobUpdate).toHaveBeenCalledWith({
      where: { id: "job-failed" },
      data : expect.objectContaining({
        status  : AnalysisJobStatus.FAILED,
        errorLog: "ai failed"
      })
    });
    expect(bookUpdate).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status       : "ERROR",
        parseProgress: 0,
        parseStage   : "解析失败",
        errorLog     : "ai failed"
      })
    });
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
      });
    chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-2", no: 2 },
      { id: "chapter-3", no: 3 }
    ]);

    await runner.runAnalysisJobById("job-range");
    expect(chapterFindMany).toHaveBeenCalledWith({
      where: {
        bookId: "book-1",
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
        id          : "running-job",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "running-job",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });
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
        id          : "queued-job",
        bookId      : "book-1",
        status      : AnalysisJobStatus.QUEUED,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      })
      .mockResolvedValueOnce({
        id          : "queued-job",
        bookId      : "book-1",
        status      : AnalysisJobStatus.RUNNING,
        scope       : "FULL_BOOK",
        chapterStart: null,
        chapterEnd  : null
      });
    analysisJobUpdateMany.mockResolvedValueOnce({ count: 1 });
    chapterFindMany.mockResolvedValueOnce([{ id: "chapter-1", no: 1 }]);

    await expect(runner.runNextAnalysisJob()).resolves.toBe("queued-job");
    await expect(runner.runNextAnalysisJob()).resolves.toBeNull();
  });
});
