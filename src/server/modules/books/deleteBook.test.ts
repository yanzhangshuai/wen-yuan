import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createDeleteBookService } from "@/server/modules/books/deleteBook";
import { BookNotFoundError } from "@/server/modules/books/errors";

describe("deleteBook", () => {
  it("soft deletes book and cancels active analysis jobs", async () => {
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const bookUpdate = vi.fn().mockResolvedValue({ id: "book-1" });
    const analysisJobUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const transaction = vi.fn().mockImplementation(async (ops: Promise<unknown>[]) => Promise.all(ops));
    const service = createDeleteBookService({
      book        : { findFirst: bookFindFirst, update: bookUpdate },
      analysisJob : { updateMany: analysisJobUpdateMany },
      $transaction: transaction
    } as never);

    // Act
    const result = await service.deleteBook("book-1");

    // Assert
    expect(bookFindFirst).toHaveBeenCalledWith({
      where : { id: "book-1", deletedAt: null },
      select: { id: true }
    });
    expect(transaction).toHaveBeenCalledOnce();
    expect(bookUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "book-1" },
      data : expect.objectContaining({ deletedAt: expect.any(Date) })
    }));
    expect(analysisJobUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ bookId: "book-1" }),
      data : expect.objectContaining({ status: AnalysisJobStatus.CANCELED })
    }));
    expect(result).toEqual({ id: "book-1" });
  });

  it("throws BookNotFoundError for missing book", async () => {
    // Arrange
    const service = createDeleteBookService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null),
        update   : vi.fn()
      },
      analysisJob : { updateMany: vi.fn() },
      $transaction: vi.fn()
    } as never);

    // Act + Assert
    await expect(service.deleteBook("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
