import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createGetBookByIdService } from "@/server/modules/books/getBookById";

describe("getBookById", () => {
  it("returns one book in library detail shape", async () => {
    // Arrange
    const findFirst = vi.fn().mockResolvedValue({
      id            : "book-1",
      title         : "儒林外史",
      author        : "吴敬梓",
      dynasty       : "清",
      description   : "群像小说",
      coverUrl      : "/api/assets/books/book-1/cover/cover.png",
      status        : "COMPLETED",
      errorLog      : null,
      createdAt     : new Date("2026-03-24T09:10:00.000Z"),
      updatedAt     : new Date("2026-03-24T10:10:00.000Z"),
      sourceFileKey : "books/book-1/source/original.txt",
      sourceFileUrl : "/api/assets/books/book-1/source/original.txt",
      sourceFileName: "rulin.txt",
      sourceFileMime: "text/plain; charset=utf-8",
      sourceFileSize: 999,
      aiModel       : {
        name: "DeepSeek V3"
      },
      chapters    : [{ id: "chapter-1" }, { id: "chapter-2" }],
      profiles    : [{ id: "profile-1" }],
      analysisJobs: [
        {
          updatedAt : new Date("2026-03-24T10:09:00.000Z"),
          finishedAt: new Date("2026-03-24T10:09:30.000Z"),
          errorLog  : null,
          aiModel   : {
            name: "DeepSeek V3"
          }
        }
      ]
    });
    const service = createGetBookByIdService({ book: { findFirst } } as never);

    // Act
    const result = await service.getBookById("book-1");

    // Assert
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id       : "book-1",
        deletedAt: null
      }
    }));
    expect(result).toEqual({
      id              : "book-1",
      title           : "儒林外史",
      author          : "吴敬梓",
      dynasty         : "清",
      coverUrl        : "/api/assets/books/book-1/cover/cover.png",
      status          : "COMPLETED",
      chapterCount    : 2,
      personaCount    : 1,
      lastAnalyzedAt  : "2026-03-24T10:09:30.000Z",
      currentModel    : "DeepSeek V3",
      lastErrorSummary: null,
      createdAt       : "2026-03-24T09:10:00.000Z",
      updatedAt       : "2026-03-24T10:10:00.000Z",
      sourceFile      : {
        key : "books/book-1/source/original.txt",
        url : "/api/assets/books/book-1/source/original.txt",
        name: "rulin.txt",
        mime: "text/plain; charset=utf-8",
        size: 999
      }
    });
  });

  it("throws BookNotFoundError when id does not exist", async () => {
    // Arrange
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = createGetBookByIdService({ book: { findFirst } } as never);

    // Act + Assert
    await expect(service.getBookById("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
