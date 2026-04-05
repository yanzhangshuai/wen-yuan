import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createDeleteBookService } from "@/server/modules/books/deleteBook";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 文件定位（书籍服务删除单测）：
 * - 验证“书籍删除”业务并非仅处理书本主记录，还会联动取消进行中的分析任务。
 * - 这是数据一致性关键点：书籍被删除后，不应继续消耗算力跑分析。
 */
describe("deleteBook", () => {
  it("soft deletes book and cancels active analysis jobs", async () => {
    // 场景意义：删除图书时，必须同时完成
    // 1) 软删除 book（保留历史）
    // 2) 批量撤销关联 analysisJob（避免脏任务继续运行）
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
    // 边界条件：删除前先校验存在性，防止对不存在资源执行副作用操作。
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
