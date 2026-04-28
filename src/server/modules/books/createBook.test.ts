/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { describe, expect, it, vi } from "vitest";

import { createCreateBookService } from "@/server/modules/books/createBook";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("createBook", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("stores source file buffer and creates book record without chapters", async () => {
    // Arrange
    const fileContent = Buffer.from("第1回 范进中举\n正文一\n第2回 周进入学\n正文二");
    const putObject = vi.fn().mockResolvedValue({
      key        : "books/20260328/rulin.txt",
      url        : "https://assets.example.com/books/20260328/rulin.txt",
      contentType: "text/plain; charset=utf-8",
      size       : fileContent.byteLength
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const bookCreate = vi.fn().mockResolvedValue({
      id            : "book-1",
      title         : "儒林外史",
      author        : "吴敬梓",
      dynasty       : "清",
      description   : "群像小说",
      status        : "PENDING",
      sourceFileKey : "books/20260328/rulin.txt",
      sourceFileUrl : "https://assets.example.com/books/20260328/rulin.txt",
      sourceFileName: "rulin.txt",
      sourceFileMime: "text/plain; charset=utf-8",
      sourceFileSize: fileContent.byteLength
    });

    const service = createCreateBookService(
      { book: { create: bookCreate } } as never,
      { putObject, deleteObject, getObjectUrl: vi.fn(), getObject: vi.fn() }
    );

    // Act
    const result = await service.createBook({
      title      : "儒林外史",
      author     : "吴敬梓",
      dynasty    : "清",
      description: "群像小说",
      fileName   : "rulin.txt",
      fileMime   : "text/plain; charset=utf-8",
      fileContent
    });

    // Assert: file upload called with Buffer body
    expect(putObject).toHaveBeenCalledOnce();
    expect(putObject).toHaveBeenCalledWith({
      key        : expect.stringMatching(/^books\/\d{8}\/rulin\.txt$/),
      body       : fileContent,
      contentType: "text/plain; charset=utf-8"
    });

    // Assert: book created directly (no $transaction, no chapter.createMany)
    expect(bookCreate).toHaveBeenCalledOnce();
    expect(bookCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        title         : "儒林外史",
        author        : "吴敬梓",
        dynasty       : "清",
        description   : "群像小说",
        sourceFileKey : "books/20260328/rulin.txt",
        sourceFileUrl : "https://assets.example.com/books/20260328/rulin.txt",
        sourceFileName: "rulin.txt",
        sourceFileMime: "text/plain; charset=utf-8",
        sourceFileSize: fileContent.byteLength
      })
    });

    // Assert: rawContent is never written to book
    expect(bookCreate.mock.calls[0]?.[0]?.data).not.toHaveProperty("rawContent");

    // Assert: no deleteObject called on success
    expect(deleteObject).not.toHaveBeenCalled();

    expect(result).toEqual({
      id         : "book-1",
      title      : "儒林外史",
      author     : "吴敬梓",
      dynasty    : "清",
      description: "群像小说",
      status     : "PENDING",
      sourceFile : {
        key : "books/20260328/rulin.txt",
        url : "https://assets.example.com/books/20260328/rulin.txt",
        name: "rulin.txt",
        mime: "text/plain; charset=utf-8",
        size: fileContent.byteLength
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
            sourceFileKey : "books/20260328/红楼梦.txt",
            sourceFileUrl : "https://assets.example.com/books/20260328/红楼梦.txt",
            sourceFileName: "红楼梦.txt",
            sourceFileMime: "text/plain; charset=utf-8",
            sourceFileSize: 8
          })
        }
      } as never,
      {
        putObject: vi.fn().mockResolvedValue({
          key        : "books/20260328/红楼梦.txt",
          url        : "https://assets.example.com/books/20260328/红楼梦.txt",
          contentType: "text/plain; charset=utf-8",
          size       : 8
        }),
        deleteObject: vi.fn().mockResolvedValue(undefined),
        getObjectUrl: vi.fn(),
        getObject   : vi.fn()
      }
    );

    // Act
    const result = await service.createBook({
      fileName   : "红楼梦.txt",
      fileContent: Buffer.from("正文")
    });

    // Assert
    expect(result.title).toBe("红楼梦");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("removes the stored object when the database write fails", async () => {
    // Arrange
    const putObject = vi.fn().mockResolvedValue({
      key        : "books/20260328/失败样例.txt",
      url        : "https://assets.example.com/books/20260328/失败样例.txt",
      contentType: "text/plain; charset=utf-8",
      size       : 8
    });
    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const service = createCreateBookService(
      {
        book: { create: vi.fn().mockRejectedValue(new Error("db boom")) }
      } as never,
      { putObject, deleteObject, getObjectUrl: vi.fn(), getObject: vi.fn() }
    );

    // Act / Assert
    await expect(
      service.createBook({
        fileName   : "失败样例.txt",
        fileContent: Buffer.from("正文")
      })
    ).rejects.toThrow("db boom");
    expect(deleteObject).toHaveBeenCalledWith("books/20260328/失败样例.txt");
  });
});
