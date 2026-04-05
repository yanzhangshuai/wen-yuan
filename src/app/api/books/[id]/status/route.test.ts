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

const getBookStatusMock = vi.fn();

vi.mock("@/server/modules/books/getBookStatus", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return {
    getBookStatus: getBookStatusMock,
    BookNotFoundError
  };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GET /api/books/:id/status", () => {
  afterEach(() => {
    getBookStatusMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns book status snapshot with 200", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    getBookStatusMock.mockResolvedValue({
      status  : "PROCESSING",
      progress: 80,
      stage   : "关系建模"
    });
    const { GET } = await import("@/app/api/books/[id]/status/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/status`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_STATUS_FETCHED");
    expect(payload.data).toEqual(expect.objectContaining({
      progress: 80
    }));
    expect(getBookStatusMock).toHaveBeenCalledWith(bookId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when id is invalid", async () => {
    // Arrange
    const { GET } = await import("@/app/api/books/[id]/status/route");

    // Act
    const response = await GET(
      new Request("http://localhost/api/books/invalid/status"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("书籍 ID 不合法");
    expect(getBookStatusMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when book is not found", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/getBookStatus");
    getBookStatusMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("@/app/api/books/[id]/status/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/status`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("书籍不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 500 when unexpected error happens", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    getBookStatusMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("@/app/api/books/[id]/status/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/status`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("书籍状态获取失败");
  });
});
