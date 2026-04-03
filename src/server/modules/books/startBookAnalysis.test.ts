import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  AnalysisScopeInvalidError,
  BookNotFoundError,
  createStartBookAnalysisService
} from "@/server/modules/books/startBookAnalysis";

function createMockPrisma() {
  const bookFindFirst = vi.fn();
  const bookUpdate = vi.fn();
  const tx = {
    analysisJob        : { create: vi.fn() },
    modelStrategyConfig: { create: vi.fn() },
    book               : { update: bookUpdate }
  };

  const prisma = {
    book               : { findFirst: bookFindFirst, update: bookUpdate },
    chapter            : { count: vi.fn() },
    $transaction       : vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => callback(tx)),
    analysisJob        : tx.analysisJob,
    modelStrategyConfig: tx.modelStrategyConfig
  };

  return { prisma, tx };
}

describe("startBookAnalysis", () => {
  it("creates analysis job and updates book processing status", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(12);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-1",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1");

    expect(prisma.book.findFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: { id: true }
    });
    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookId          : "book-1",
        scope           : "FULL_BOOK",
        chapterIndices  : [],
        overrideStrategy: "DRAFT_ONLY",
        keepHistory     : false
      })
    }));
    expect(tx.modelStrategyConfig.create).not.toHaveBeenCalled();
    expect(tx.book.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status       : "PROCESSING",
        parseProgress: 0,
        parseStage   : "文本清洗"
      })
    }));
    expect(result).toEqual({
      bookId          : "book-1",
      jobId           : "job-1",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false,
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
  });

  it("writes job-level strategy when modelStrategy is provided", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(12);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-2",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    await service.startBookAnalysis("book-1", {
      modelStrategy: {
        CHUNK_EXTRACTION: {
          modelId    : "00000000-0000-0000-0000-000000000001",
          temperature: 0.2
        }
      }
    });

    expect(tx.modelStrategyConfig.create).toHaveBeenCalledWith({
      data: {
        scope : "JOB",
        jobId : "job-2",
        stages: {
          CHUNK_EXTRACTION: {
            modelId    : "00000000-0000-0000-0000-000000000001",
            temperature: 0.2
          }
        }
      }
    });
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue(null);
    const service = createStartBookAnalysisService(prisma as never);
    await expect(service.startBookAnalysis("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws AnalysisScopeInvalidError for invalid chapter range", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", {
        scope       : "CHAPTER_RANGE",
        chapterStart: 20,
        chapterEnd  : 10
      })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("throws AnalysisScopeInvalidError when no chapters are confirmed", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(0);
    const service = createStartBookAnalysisService(prisma as never);

    await expect(service.startBookAnalysis("book-1")).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("creates CHAPTER_LIST analysis job with specified chapter indices", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(3);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-3",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "CHAPTER_LIST",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [1, 3, 5],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1", {
      scope         : "CHAPTER_LIST",
      chapterIndices: [5, 1, 3]
    });

    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scope         : "CHAPTER_LIST",
        chapterIndices: [1, 3, 5],
        chapterStart  : null,
        chapterEnd    : null
      })
    }));
    expect(result.chapterIndices).toEqual([1, 3, 5]);
    expect(result.scope).toBe("CHAPTER_LIST");
  });

  it("throws AnalysisScopeInvalidError for CHAPTER_LIST with empty indices", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", { scope: "CHAPTER_LIST", chapterIndices: [] })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });
});
