import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError, createGetBookStatusService } from "@/server/modules/books/getBookStatus";

describe("getBookStatus", () => {
  it("returns status snapshot for polling", async () => {
    // Arrange
    const bookUpdatedAt = new Date("2026-03-24T09:10:00.000Z");
    const jobUpdatedAt = new Date("2026-03-24T10:10:00.000Z");
    const findUnique = vi.fn().mockResolvedValue({
      id           : "book-1",
      status       : "PROCESSING",
      parseProgress: 70,
      parseStage   : "实体提取",
      errorLog     : null,
      updatedAt    : bookUpdatedAt,
      analysisJobs : [
        {
          updatedAt: jobUpdatedAt,
          errorLog : "第 9 章解析失败"
        }
      ]
    });
    const service = createGetBookStatusService({ book: { findUnique } } as never);

    // Act
    const result = await service.getBookStatus("book-1");

    // Assert
    expect(findUnique).toHaveBeenCalledOnce();
    expect(findUnique).toHaveBeenCalledWith({
      where : { id: "book-1" },
      select: expect.objectContaining({
        status       : true,
        parseProgress: true,
        parseStage   : true,
        errorLog     : true,
        updatedAt    : true
      })
    });
    expect(result).toEqual({
      id            : "book-1",
      status        : "PROCESSING",
      parseProgress : 70,
      parseStage    : "实体提取",
      failureSummary: "第 9 章解析失败",
      updatedAt     : "2026-03-24T10:10:00.000Z"
    });
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    // Arrange
    const findUnique = vi.fn().mockResolvedValue(null);
    const service = createGetBookStatusService({ book: { findUnique } } as never);

    // Act + Assert
    await expect(service.getBookStatus("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
