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

import { AppRole, ChapterType } from "@/generated/prisma/enums";

const confirmBookChaptersMock = vi.fn();

vi.mock("@/server/modules/books/confirmBookChapters", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  class BookSourceFileMissingError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book source file is missing: ${bookId}`);
      this.bookId = bookId;
    }
  }

  class ChapterConfirmPayloadError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    confirmBookChapters: confirmBookChaptersMock,
    BookNotFoundError,
    BookSourceFileMissingError,
    ChapterConfirmPayloadError
  };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/books/:id/chapters/confirm", () => {
  afterEach(() => {
    confirmBookChaptersMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("confirms chapters and returns 200", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    confirmBookChaptersMock.mockResolvedValue({
      bookId,
      chapterCount: 2,
      items       : [
        { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回", wordCount: 1000 },
        { index: 2, chapterType: ChapterType.CHAPTER, title: "第二回", wordCount: 900 }
      ]
    });
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" },
            { index: 2, chapterType: ChapterType.CHAPTER, title: "第二回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_CHAPTERS_CONFIRMED");
    expect(confirmBookChaptersMock).toHaveBeenCalledWith(bookId, [
      { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" },
      { index: 2, chapterType: ChapterType.CHAPTER, title: "第二回" }
    ]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer calls confirm API", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.VIEWER
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(confirmBookChaptersMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when route params are invalid", async () => {
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request("http://localhost/api/books/invalid/chapters/confirm", {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    expect(confirmBookChaptersMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: "INVALID", title: "第一回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(confirmBookChaptersMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps service not-found error to 404", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/confirmBookChapters");
    confirmBookChaptersMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps source file missing to 400", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookSourceFileMissingError } = await import("@/server/modules/books/confirmBookChapters");
    confirmBookChaptersMock.mockRejectedValue(new BookSourceFileMissingError(bookId));
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps payload error to 400", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { ChapterConfirmPayloadError } = await import("@/server/modules/books/confirmBookChapters");
    confirmBookChaptersMock.mockRejectedValue(new ChapterConfirmPayloadError("至少需要确认一个章节"));
    const { POST } = await import("@/app/api/books/[id]/chapters/confirm/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/chapters/confirm`, {
        method : "POST",
        headers: {
          "content-type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          items: [
            { index: 1, chapterType: ChapterType.CHAPTER, title: "第一回" }
          ]
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.detail).toBe("至少需要确认一个章节");
  });
});
