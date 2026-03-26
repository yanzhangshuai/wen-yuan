import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisJobRunner } from "@/server/modules/analysis/jobs/runAnalysisJob";

describe("analysis job runner", () => {
  it("runs queued job and marks job/book as succeeded", async () => {
    const jobId = "job-1";
    const bookId = "book-1";

    const analysisJobFindUnique = vi
      .fn()
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

    const analysisJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const analysisJobUpdate = vi.fn().mockResolvedValue({
      id    : jobId,
      status: AnalysisJobStatus.SUCCEEDED
    });
    const chapterFindMany = vi.fn().mockResolvedValue([
      { id: "chapter-1", no: 1 },
      { id: "chapter-2", no: 2 }
    ]);
    const bookUpdate = vi.fn().mockResolvedValue({});
    const transaction = vi.fn(async (operations: Promise<unknown>[]) => await Promise.all(operations));
    const analyzeChapter = vi
      .fn()
      .mockResolvedValue({
        chapterId         : "chapter-1",
        chunkCount        : 1,
        hallucinationCount: 0,
        created           : { personas: 1, mentions: 1, biographies: 1, relationships: 1 }
      });

    const runner = createAnalysisJobRunner({
      analysisJob: {
        findUnique: analysisJobFindUnique,
        updateMany: analysisJobUpdateMany,
        update    : analysisJobUpdate
      },
      chapter     : { findMany: chapterFindMany },
      book        : { update: bookUpdate },
      $transaction: transaction
    } as never, {
      analyzeChapter
    });

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
});
