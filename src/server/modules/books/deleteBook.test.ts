import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createDeleteBookService } from "@/server/modules/books/deleteBook";

describe("deleteBook", () => {
  it("deletes dependent records and source file", async () => {
    // Arrange
    const bookFindUnique = vi.fn().mockResolvedValue({
      id           : "book-1",
      sourceFileKey: "books/book-1/source/original.txt"
    });
    const chapterFindMany = vi.fn().mockResolvedValue([
      { id: "chapter-1" },
      { id: "chapter-2" }
    ]);
    const relationshipDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const biographyDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const mentionDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const analysisJobDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const profileDeleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const chapterDeleteMany = vi.fn().mockResolvedValue({ count: 2 });
    const bookDelete = vi.fn().mockResolvedValue({ id: "book-1" });
    const transaction = vi.fn(async (callback) => callback({
      relationship   : { deleteMany: relationshipDeleteMany },
      biographyRecord: { deleteMany: biographyDeleteMany },
      mention        : { deleteMany: mentionDeleteMany },
      analysisJob    : { deleteMany: analysisJobDeleteMany },
      profile        : { deleteMany: profileDeleteMany },
      chapter        : { deleteMany: chapterDeleteMany },
      book           : { delete: bookDelete }
    }));
    const deleteObject = vi.fn().mockResolvedValue(undefined);

    const service = createDeleteBookService(
      {
        book        : { findUnique: bookFindUnique },
        chapter     : { findMany: chapterFindMany },
        $transaction: transaction
      } as never,
      { deleteObject, putObject: vi.fn(), getObjectUrl: vi.fn() } as never
    );

    // Act
    const result = await service.deleteBook("book-1");

    // Assert
    expect(bookFindUnique).toHaveBeenCalledWith({
      where : { id: "book-1" },
      select: {
        id           : true,
        sourceFileKey: true
      }
    });
    expect(chapterFindMany).toHaveBeenCalledWith({
      where : { bookId: "book-1" },
      select: { id: true }
    });
    expect(relationshipDeleteMany).toHaveBeenCalledWith({
      where: {
        chapterId: {
          in: ["chapter-1", "chapter-2"]
        }
      }
    });
    expect(bookDelete).toHaveBeenCalledWith({
      where: { id: "book-1" }
    });
    expect(deleteObject).toHaveBeenCalledWith("books/book-1/source/original.txt");
    expect(result).toEqual({ id: "book-1" });
  });

  it("throws BookNotFoundError for missing book", async () => {
    // Arrange
    const service = createDeleteBookService(
      {
        book        : { findUnique: vi.fn().mockResolvedValue(null) },
        chapter     : { findMany: vi.fn() },
        $transaction: vi.fn()
      } as never,
      { deleteObject: vi.fn(), putObject: vi.fn(), getObjectUrl: vi.fn() } as never
    );

    // Act + Assert
    await expect(service.deleteBook("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});

