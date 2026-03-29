import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError, createGetBookStatusService } from "@/server/modules/books/getBookStatus";

describe("getBookStatus", () => {
  it("returns status snapshot for polling", async () => {
    // Arrange
    const findFirst = vi.fn().mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 70,
      parseStage   : "实体提取",
      errorLog     : null,
      analysisJobs : [
        {
          updatedAt: new Date("2026-03-24T10:10:00.000Z"),
          errorLog : "第 9 章解析失败"
        }
      ],
      chapters: [
        { no: 1, title: "第一回", parseStatus: "SUCCEEDED" },
        { no: 2, title: "第二回", parseStatus: "PROCESSING" }
      ]
    });
    const service = createGetBookStatusService({ book: { findFirst } } as never);

    // Act
    const result = await service.getBookStatus("book-1");

    // Assert
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: expect.objectContaining({
        status       : true,
        parseProgress: true,
        parseStage   : true,
        errorLog     : true,
        chapters     : expect.objectContaining({ select: expect.objectContaining({ parseStatus: true }) })
      })
    });
    expect(result).toEqual({
      status  : "PROCESSING",
      progress: 70,
      stage   : "实体提取",
      errorLog: "第 9 章解析失败",
      chapters: [
        { no: 1, title: "第一回", parseStatus: "SUCCEEDED" },
        { no: 2, title: "第二回", parseStatus: "PROCESSING" }
      ]
    });
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    // Arrange
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = createGetBookStatusService({ book: { findFirst } } as never);

    // Act + Assert
    await expect(service.getBookStatus("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
