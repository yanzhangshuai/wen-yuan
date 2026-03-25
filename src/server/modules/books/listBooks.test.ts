import { describe, expect, it, vi } from "vitest";

import { createListBooksService } from "@/server/modules/books/listBooks";

describe("listBooks", () => {
  it("returns books in library view shape with source file snapshot", async () => {
    // Arrange
    const updatedAt = new Date("2026-03-24T10:10:00.000Z");
    const createdAt = new Date("2026-03-24T09:10:00.000Z");
    const findMany = vi.fn().mockResolvedValue([
      {
        id            : "book-1",
        title         : "儒林外史",
        author        : "吴敬梓",
        dynasty       : "清",
        coverUrl      : "/api/assets/books/book-1/cover/cover.png",
        status        : "COMPLETED",
        parseProgress : 100,
        parseStage    : "完成",
        errorLog      : null,
        createdAt,
        updatedAt,
        sourceFileKey : "books/book-1/source/original.txt",
        sourceFileUrl : "/api/assets/books/book-1/source/original.txt",
        sourceFileName: "rulin.txt",
        sourceFileMime: "text/plain; charset=utf-8",
        sourceFileSize: 1234,
        aiModel       : {
          name: "DeepSeek V3"
        },
        chapters: [
          { id: "chapter-1" },
          { id: "chapter-2" }
        ],
        profiles: [
          { id: "profile-1" },
          { id: "profile-2" },
          { id: "profile-3" }
        ],
        analysisJobs: [
          {
            updatedAt : new Date("2026-03-24T10:00:00.000Z"),
            finishedAt: new Date("2026-03-24T10:08:00.000Z"),
            errorLog  : null,
            aiModel   : {
              name: "DeepSeek V3"
            }
          }
        ]
      }
    ]);
    const service = createListBooksService({ book: { findMany } } as never);

    // Act
    const result = await service.listBooks();

    // Assert
    expect(findMany).toHaveBeenCalledOnce();
    expect(findMany).toHaveBeenCalledWith({
      orderBy: { updatedAt: "desc" },
      select : expect.objectContaining({
        id           : true,
        title        : true,
        coverUrl     : true,
        parseProgress: true,
        errorLog     : true,
        sourceFileKey: true,
        chapters     : { select: { id: true } },
        profiles     : {
          where : { deletedAt: null },
          select: { id: true }
        }
      })
    });
    expect(result).toEqual([
      {
        id              : "book-1",
        title           : "儒林外史",
        author          : "吴敬梓",
        dynasty         : "清",
        coverUrl        : "/api/assets/books/book-1/cover/cover.png",
        status          : "COMPLETED",
        chapterCount    : 2,
        personaCount    : 3,
        lastAnalyzedAt  : "2026-03-24T10:08:00.000Z",
        currentModelName: "DeepSeek V3",
        failureSummary  : null,
        parseProgress   : 100,
        parseStage      : "完成",
        createdAt       : "2026-03-24T09:10:00.000Z",
        updatedAt       : "2026-03-24T10:10:00.000Z",
        sourceFile      : {
          key : "books/book-1/source/original.txt",
          url : "/api/assets/books/book-1/source/original.txt",
          name: "rulin.txt",
          mime: "text/plain; charset=utf-8",
          size: 1234
        }
      }
    ]);
  });

  it("falls back to legacy query when source file columns are not migrated yet", async () => {
    // Arrange
    const missingColumnError = Object.assign(new Error("column not found"), { code: "P2022" });
    const findMany = vi
      .fn()
      .mockRejectedValueOnce(missingColumnError)
      .mockResolvedValueOnce([
        {
          id           : "book-2",
          title        : "聊斋志异",
          author       : "蒲松龄",
          dynasty      : "清",
          coverUrl     : null,
          status       : "PROCESSING",
          parseProgress: 62,
          parseStage   : "实体提取",
          errorLog     : null,
          createdAt    : new Date("2026-03-24T08:00:00.000Z"),
          updatedAt    : new Date("2026-03-24T11:00:00.000Z"),
          aiModel      : null,
          chapters     : [{ id: "chapter-1" }],
          profiles     : [{ id: "profile-1" }],
          analysisJobs : []
        }
      ]);
    const service = createListBooksService({ book: { findMany } } as never);

    // Act
    const result = await service.listBooks();

    // Assert
    expect(findMany).toHaveBeenCalledTimes(2);
    expect(findMany.mock.calls[0]?.[0]?.select?.sourceFileKey).toBe(true);
    expect(findMany.mock.calls[1]?.[0]?.select?.sourceFileKey).toBeUndefined();
    expect(result).toEqual([
      {
        id              : "book-2",
        title           : "聊斋志异",
        author          : "蒲松龄",
        dynasty         : "清",
        coverUrl        : null,
        status          : "PROCESSING",
        chapterCount    : 1,
        personaCount    : 1,
        lastAnalyzedAt  : "2026-03-24T11:00:00.000Z",
        currentModelName: null,
        failureSummary  : null,
        parseProgress   : 62,
        parseStage      : "实体提取",
        createdAt       : "2026-03-24T08:00:00.000Z",
        updatedAt       : "2026-03-24T11:00:00.000Z",
        sourceFile      : {
          key : null,
          url : null,
          name: null,
          mime: null,
          size: null
        }
      }
    ]);
  });
});
