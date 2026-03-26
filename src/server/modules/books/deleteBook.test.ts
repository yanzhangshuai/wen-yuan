import { describe, expect, it, vi } from "vitest";

import { createDeleteBookService } from "@/server/modules/books/deleteBook";
import { BookNotFoundError } from "@/server/modules/books/errors";

describe("deleteBook", () => {
  it("soft deletes book by setting deletedAt", async () => {
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const bookUpdate = vi.fn().mockResolvedValue({ id: "book-1" });
    const service = createDeleteBookService({
      book: {
        findFirst: bookFindFirst,
        update   : bookUpdate
      }
    } as never);

    // Act
    const result = await service.deleteBook("book-1");

    // Assert
    expect(bookFindFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: {
        id: true
      }
    });
    expect(bookUpdate).toHaveBeenCalledWith({
      where: { id: "book-1" },
      data : {
        deletedAt: expect.any(Date)
      },
      select: {
        id: true
      }
    });
    expect(result).toEqual({ id: "book-1" });
  });

  it("throws BookNotFoundError for missing book", async () => {
    // Arrange
    const service = createDeleteBookService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null),
        update   : vi.fn()
      }
    } as never);

    // Act + Assert
    await expect(service.deleteBook("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
