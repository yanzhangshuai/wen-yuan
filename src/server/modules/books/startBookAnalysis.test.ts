import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  AnalysisModelDisabledError,
  AnalysisModelNotFoundError,
  AnalysisScopeInvalidError,
  BookNotFoundError,
  createStartBookAnalysisService
} from "@/server/modules/books/startBookAnalysis";

describe("startBookAnalysis", () => {
  it("creates analysis job and updates book processing status", async () => {
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue({
      id       : "book-1",
      aiModelId: "model-1"
    });
    const modelFindUnique = vi.fn().mockResolvedValue({
      id       : "model-1",
      isEnabled: true
    });
    const analysisJobCreate = vi.fn().mockResolvedValue({
      id              : "job-1",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    const bookUpdate = vi.fn().mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });
    const chapterCount = vi.fn().mockResolvedValue(12);
    const transaction = vi.fn(async (operations) => Promise.all(operations));
    const service = createStartBookAnalysisService({
      book        : { findFirst: bookFindFirst, update: bookUpdate },
      aiModel     : { findUnique: modelFindUnique },
      chapter     : { count: chapterCount },
      analysisJob : { create: analysisJobCreate },
      $transaction: transaction
    } as never);

    // Act
    const result = await service.startBookAnalysis("book-1");

    // Assert
    expect(bookFindFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: { id: true, aiModelId: true }
    });
    expect(modelFindUnique).toHaveBeenCalledWith({
      where : { id: "model-1" },
      select: { id: true, isEnabled: true }
    });
    expect(analysisJobCreate).toHaveBeenCalled();
    expect(analysisJobCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        overrideStrategy: "DRAFT_ONLY",
        keepHistory     : false
      })
    }));
    expect(bookUpdate).toHaveBeenCalledWith(expect.objectContaining({
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
      aiModelId       : "model-1",
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    // Arrange
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue(null) },
      aiModel     : { findUnique: vi.fn() },
      chapter     : { count: vi.fn() },
      analysisJob : { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    // Act + Assert
    await expect(service.startBookAnalysis("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws AnalysisModelNotFoundError when selected model does not exist", async () => {
    // Arrange
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel     : { findUnique: vi.fn().mockResolvedValue(null) },
      chapter     : { count: vi.fn() },
      analysisJob : { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    // Act + Assert
    await expect(
      service.startBookAnalysis("book-1", { aiModelId: "missing-model" })
    ).rejects.toBeInstanceOf(AnalysisModelNotFoundError);
  });

  it("throws AnalysisModelDisabledError when selected model is disabled", async () => {
    // Arrange
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel     : { findUnique: vi.fn().mockResolvedValue({ id: "model-1", isEnabled: false }) },
      chapter     : { count: vi.fn() },
      analysisJob : { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    // Act + Assert
    await expect(
      service.startBookAnalysis("book-1", { aiModelId: "model-1" })
    ).rejects.toBeInstanceOf(AnalysisModelDisabledError);
  });

  it("throws AnalysisScopeInvalidError for invalid chapter range", async () => {
    // Arrange
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel     : { findUnique: vi.fn() },
      chapter     : { count: vi.fn() },
      analysisJob : { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    // Act + Assert
    await expect(
      service.startBookAnalysis("book-1", {
        scope       : "CHAPTER_RANGE",
        chapterStart: 20,
        chapterEnd  : 10
      })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("throws AnalysisScopeInvalidError when no chapters are confirmed", async () => {
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: "model-1" }) },
      aiModel     : { findUnique: vi.fn().mockResolvedValue({ id: "model-1", isEnabled: true }) },
      chapter     : { count: vi.fn().mockResolvedValue(0) },
      analysisJob : { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    await expect(service.startBookAnalysis("book-1")).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("creates CHAPTER_LIST analysis job with specified chapter indices", async () => {
    // Arrange
    const analysisJobCreate = vi.fn().mockResolvedValue({
      id              : "job-2",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "CHAPTER_LIST",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [1, 3, 5],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    const bookUpdate = vi.fn().mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });
    const transaction = vi.fn(async (operations) => Promise.all(operations));
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }), update: bookUpdate },
      aiModel     : { findUnique: vi.fn() },
      chapter     : { count: vi.fn().mockResolvedValue(3) },
      analysisJob : { create: analysisJobCreate },
      $transaction: transaction
    } as never);

    // Act
    const result = await service.startBookAnalysis("book-1", {
      scope         : "CHAPTER_LIST",
      chapterIndices: [5, 1, 3]
    });

    // Assert: indices are deduplicated and sorted
    expect(analysisJobCreate).toHaveBeenCalledWith(expect.objectContaining({
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
    const service = createStartBookAnalysisService({
      book        : { findFirst: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel     : { findUnique: vi.fn() },
      chapter     : { count: vi.fn() },
      analysisJob : { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    await expect(
      service.startBookAnalysis("book-1", { scope: "CHAPTER_LIST", chapterIndices: [] })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });
});
