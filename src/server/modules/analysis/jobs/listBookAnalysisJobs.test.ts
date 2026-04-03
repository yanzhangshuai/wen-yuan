import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createListBookAnalysisJobsService } from "@/server/modules/analysis/jobs/listBookAnalysisJobs";
import { BookNotFoundError } from "@/server/modules/books/errors";

const NOW = new Date("2025-03-28T10:00:00.000Z");
const STARTED_AT = new Date("2025-03-28T09:55:00.000Z");
const FINISHED_AT = new Date("2025-03-28T09:58:00.000Z");

describe("listBookAnalysisJobs", () => {
  it("returns job list for existing book", async () => {
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const analysisJobFindMany = vi.fn().mockResolvedValue([
      {
        id            : "job-1",
        status        : AnalysisJobStatus.SUCCEEDED,
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: [],
        attempt       : 1,
        errorLog      : null,
        startedAt     : STARTED_AT,
        finishedAt    : FINISHED_AT,
        createdAt     : NOW,
        phaseLogs     : [
          {
            model: { name: "gpt-4o" }
          }
        ]
      },
      {
        id            : "job-2",
        status        : AnalysisJobStatus.FAILED,
        scope         : "CHAPTER_RANGE",
        chapterStart  : 1,
        chapterEnd    : 5,
        chapterIndices: [],
        attempt       : 2,
        errorLog      : "LLM timeout",
        startedAt     : STARTED_AT,
        finishedAt    : null,
        createdAt     : NOW,
        phaseLogs     : []
      }
    ]);

    const service = createListBookAnalysisJobsService({
      book       : { findFirst: bookFindFirst },
      analysisJob: { findMany: analysisJobFindMany }
    } as never);

    // Act
    const result = await service.listBookAnalysisJobs("book-1");

    // Assert
    expect(bookFindFirst).toHaveBeenCalledWith({
      where : { id: "book-1", deletedAt: null },
      select: { id: true }
    });
    expect(analysisJobFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where  : { bookId: "book-1" },
      orderBy: { createdAt: "desc" }
    }));
    expect(result).toHaveLength(2);

    const [first, second] = result;
    expect(first).toMatchObject({
      id          : "job-1",
      status      : AnalysisJobStatus.SUCCEEDED,
      scope       : "FULL_BOOK",
      chapterStart: null,
      chapterEnd  : null,
      attempt     : 1,
      errorLog    : null,
      startedAt   : STARTED_AT.toISOString(),
      finishedAt  : FINISHED_AT.toISOString(),
      createdAt   : NOW.toISOString(),
      aiModelName : "gpt-4o"
    });
    expect(second).toMatchObject({
      id          : "job-2",
      status      : AnalysisJobStatus.FAILED,
      scope       : "CHAPTER_RANGE",
      chapterStart: 1,
      chapterEnd  : 5,
      attempt     : 2,
      errorLog    : "LLM timeout",
      finishedAt  : null,
      aiModelName : null
    });
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    // Arrange
    const service = createListBookAnalysisJobsService({
      book       : { findFirst: vi.fn().mockResolvedValue(null) },
      analysisJob: { findMany: vi.fn() }
    } as never);

    // Act + Assert
    await expect(service.listBookAnalysisJobs("missing-id")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("returns empty list when book has no jobs", async () => {
    // Arrange
    const service = createListBookAnalysisJobsService({
      book       : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
      analysisJob: { findMany: vi.fn().mockResolvedValue([]) }
    } as never);

    // Act
    const result = await service.listBookAnalysisJobs("book-1");

    // Assert
    expect(result).toEqual([]);
  });
});
