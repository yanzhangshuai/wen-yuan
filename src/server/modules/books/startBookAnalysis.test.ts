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
    const bookFindUnique = vi.fn().mockResolvedValue({
      id      : "book-1",
      aiModelId: "model-1"
    });
    const modelFindUnique = vi.fn().mockResolvedValue({
      id       : "model-1",
      isEnabled: true
    });
    const analysisJobCreate = vi.fn().mockResolvedValue({
      id          : "job-1",
      status      : AnalysisJobStatus.QUEUED,
      scope       : "FULL_BOOK",
      chapterStart: null,
      chapterEnd  : null
    });
    const bookUpdate = vi.fn().mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });
    const transaction = vi.fn(async (operations) => Promise.all(operations));
    const service = createStartBookAnalysisService({
      book       : { findUnique: bookFindUnique, update: bookUpdate },
      aiModel    : { findUnique: modelFindUnique },
      analysisJob: { create: analysisJobCreate },
      $transaction: transaction
    } as never);

    // Act
    const result = await service.startBookAnalysis("book-1");

    // Assert
    expect(bookFindUnique).toHaveBeenCalledWith({
      where : { id: "book-1" },
      select: { id: true, aiModelId: true }
    });
    expect(modelFindUnique).toHaveBeenCalledWith({
      where : { id: "model-1" },
      select: { id: true, isEnabled: true }
    });
    expect(analysisJobCreate).toHaveBeenCalled();
    expect(bookUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status       : "PROCESSING",
        parseProgress: 0,
        parseStage   : "文本清洗"
      })
    }));
    expect(result).toEqual({
      bookId       : "book-1",
      jobId        : "job-1",
      status       : AnalysisJobStatus.QUEUED,
      scope        : "FULL_BOOK",
      chapterStart : null,
      chapterEnd   : null,
      aiModelId    : "model-1",
      bookStatus   : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    // Arrange
    const service = createStartBookAnalysisService({
      book       : { findUnique: vi.fn().mockResolvedValue(null) },
      aiModel    : { findUnique: vi.fn() },
      analysisJob: { create: vi.fn() },
      $transaction: vi.fn()
    } as never);

    // Act + Assert
    await expect(service.startBookAnalysis("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws AnalysisModelNotFoundError when selected model does not exist", async () => {
    // Arrange
    const service = createStartBookAnalysisService({
      book       : { findUnique: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel    : { findUnique: vi.fn().mockResolvedValue(null) },
      analysisJob: { create: vi.fn() },
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
      book       : { findUnique: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel    : { findUnique: vi.fn().mockResolvedValue({ id: "model-1", isEnabled: false }) },
      analysisJob: { create: vi.fn() },
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
      book       : { findUnique: vi.fn().mockResolvedValue({ id: "book-1", aiModelId: null }) },
      aiModel    : { findUnique: vi.fn() },
      analysisJob: { create: vi.fn() },
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
});

