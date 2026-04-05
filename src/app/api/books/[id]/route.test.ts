/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 app/ 目录下的 route.ts（或其动态路由变体）测试，验证接口层契约是否稳定。
 * - 在 Next.js 中，route.ts 由文件系统路由自动注册为 HTTP 接口；本测试通过直接调用导出的 HTTP 方法函数复现服务端执行语义。
 *
 * 业务职责：
 * - 约束请求参数校验、鉴权分支、服务层调用参数、错误码映射、统一响应包结构。
 * - 保护上下游协作边界：上游是浏览器/管理端请求，下游是各领域 service 与数据访问层。
 *
 * 维护注意：
 * - 这是接口契约测试，断言字段和状态码属于外部约定，不能随意改动。
 * - 若未来调整路由/错误码，请同步更新前端调用方与文档，否则会造成线上联调回归。
 */

import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRole } from "@/generated/prisma/enums";

const getBookByIdMock = vi.fn();
const deleteBookMock = vi.fn();

vi.mock("@/server/modules/books/getBookById", () => ({
  getBookById: getBookByIdMock
}));

vi.mock("@/server/modules/books/deleteBook", () => ({
  deleteBook: deleteBookMock
}));

vi.mock("@/server/modules/books/errors", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return { BookNotFoundError };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GET /api/books/:id", () => {
  afterEach(() => {
    getBookByIdMock.mockReset();
    deleteBookMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns one book by id", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    getBookByIdMock.mockResolvedValue({
      id              : bookId,
      title           : "儒林外史",
      author          : "吴敬梓",
      dynasty         : "清",
      coverUrl        : null,
      status          : "PENDING",
      chapterCount    : 0,
      personaCount    : 0,
      lastAnalyzedAt  : null,
      currentModel    : null,
      lastErrorSummary: null,
      createdAt       : "2026-03-24T00:00:00.000Z",
      updatedAt       : "2026-03-24T00:00:00.000Z",
      sourceFile      : {
        key : "books/book-1/source/original.txt",
        url : "/api/assets/books/book-1/source/original.txt",
        name: "rulin.txt",
        mime: "text/plain; charset=utf-8",
        size: 100
      }
    });
    const { GET } = await import("@/app/api/books/[id]/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_FETCHED");
    expect(payload.data.id).toBe(bookId);
    expect(getBookByIdMock).toHaveBeenCalledWith(bookId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid id", async () => {
    // Arrange
    const { GET } = await import("@/app/api/books/[id]/route");

    // Act
    const response = await GET(
      new Request("http://localhost/api/books/invalid"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(getBookByIdMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when book does not exist", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    getBookByIdMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("@/app/api/books/[id]/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("DELETE /api/books/:id", () => {
  afterEach(() => {
    getBookByIdMock.mockReset();
    deleteBookMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("deletes one book by id", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    deleteBookMock.mockResolvedValue({ id: bookId });
    const { DELETE } = await import("@/app/api/books/[id]/route");

    // Act
    const response = await DELETE(
      new Request(`http://localhost/api/books/${bookId}`, {
        method : "DELETE",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_DELETED");
    expect(deleteBookMock).toHaveBeenCalledWith(bookId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when delete target does not exist", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    deleteBookMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { DELETE } = await import("@/app/api/books/[id]/route");

    // Act
    const response = await DELETE(
      new Request(`http://localhost/api/books/${bookId}`, {
        method : "DELETE",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("书籍不存在");
  });
});
