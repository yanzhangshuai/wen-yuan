import { describe, expect, it, vi } from "vitest";

import { createCreateBookService } from "@/server/modules/books/createBook";

describe("createBook", () => {
  it("stores the original txt file and persists its metadata on Book", async () => {
    // Arrange
    const putObject = vi.fn().mockResolvedValue({
      key        : "books/book-1/source/original.txt",
      url        : "/api/assets/books/book-1/source/original.txt",
      contentType: "text/plain; charset=utf-8",
      size       : 12
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const bookCreate = vi.fn().mockResolvedValue({
      id            : "book-1",
      title         : "儒林外史",
      author        : "吴敬梓",
      dynasty       : "清",
      description   : "群像小说",
      status        : "PENDING",
      sourceFileKey : "books/book-1/source/original.txt",
      sourceFileUrl : "/api/assets/books/book-1/source/original.txt",
      sourceFileName: "rulin.txt",
      sourceFileMime: "text/plain; charset=utf-8",
      sourceFileSize: 12
    });

    const service = createCreateBookService(
      { book: { create: bookCreate } } as never,
      { putObject, deleteObject, getObjectUrl: vi.fn() } as never
    );

    // Act
    const result = await service.createBook({
      title      : "儒林外史",
      author     : "吴敬梓",
      dynasty    : "清",
      description: "群像小说",
      fileName   : "rulin.txt",
      fileMime   : "text/plain; charset=utf-8",
      rawContent : "第一回 ..."
    });

    // Assert
    expect(putObject).toHaveBeenCalledOnce();
    expect(putObject).toHaveBeenCalledWith({
      key        : expect.stringMatching(/^books\/.+\/source\/original\.txt$/),
      body       : "第一回 ...",
      contentType: "text/plain; charset=utf-8"
    });
    expect(bookCreate).toHaveBeenCalledOnce();
    expect(bookCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title         : "儒林外史",
        author        : "吴敬梓",
        dynasty       : "清",
        description   : "群像小说",
        rawContent    : "第一回 ...",
        sourceFileKey : "books/book-1/source/original.txt",
        sourceFileUrl : "/api/assets/books/book-1/source/original.txt",
        sourceFileName: "rulin.txt",
        sourceFileMime: "text/plain; charset=utf-8",
        sourceFileSize: 12
      })
    });
    expect(deleteObject).not.toHaveBeenCalled();
    expect(result).toEqual({
      id         : "book-1",
      title      : "儒林外史",
      author     : "吴敬梓",
      dynasty    : "清",
      description: "群像小说",
      status     : "PENDING",
      sourceFile : {
        key : "books/book-1/source/original.txt",
        url : "/api/assets/books/book-1/source/original.txt",
        name: "rulin.txt",
        mime: "text/plain; charset=utf-8",
        size: 12
      }
    });
  });

  it("falls back to the original file name when title is omitted", async () => {
    // Arrange
    const service = createCreateBookService(
      {
        book: {
          create: vi.fn().mockResolvedValue({
            id            : "book-2",
            title         : "红楼梦",
            author        : null,
            dynasty       : null,
            description   : null,
            status        : "PENDING",
            sourceFileKey : "books/book-2/source/original.txt",
            sourceFileUrl : "/api/assets/books/book-2/source/original.txt",
            sourceFileName: "红楼梦.txt",
            sourceFileMime: "text/plain; charset=utf-8",
            sourceFileSize: 8
          })
        }
      } as never,
      {
        putObject: vi.fn().mockResolvedValue({
          key        : "books/book-2/source/original.txt",
          url        : "/api/assets/books/book-2/source/original.txt",
          contentType: "text/plain; charset=utf-8",
          size       : 8
        }),
        deleteObject: vi.fn().mockResolvedValue(undefined),
        getObjectUrl: vi.fn()
      } as never
    );

    // Act
    const result = await service.createBook({
      fileName  : "红楼梦.txt",
      rawContent: "正文"
    });

    // Assert
    expect(result.title).toBe("红楼梦");
  });

  it("removes the stored object when the database write fails", async () => {
    // Arrange
    const putObject = vi.fn().mockResolvedValue({
      key        : "books/book-3/source/original.txt",
      url        : "/api/assets/books/book-3/source/original.txt",
      contentType: "text/plain; charset=utf-8",
      size       : 8
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const service = createCreateBookService(
      {
        book: {
          create: vi.fn().mockRejectedValue(new Error("db boom"))
        }
      } as never,
      { putObject, deleteObject, getObjectUrl: vi.fn() } as never
    );

    // Act / Assert
    await expect(
      service.createBook({
        fileName  : "失败样例.txt",
        rawContent: "正文"
      })
    ).rejects.toThrow("db boom");
    expect(deleteObject).toHaveBeenCalledWith("books/book-3/source/original.txt");
  });
});
