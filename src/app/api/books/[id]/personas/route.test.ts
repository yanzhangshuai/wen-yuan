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

import { AppRole, NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const listBookPersonasMock = vi.fn();
const createBookPersonaMock = vi.fn();

vi.mock("@/server/modules/personas/listBookPersonas", () => ({
  listBookPersonas: listBookPersonasMock
}));

vi.mock("@/server/modules/personas/createBookPersona", () => ({
  createBookPersona: createBookPersonaMock
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
describe("GET /api/books/:id/personas", () => {
  afterEach(() => {
    listBookPersonasMock.mockReset();
    createBookPersonaMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns personas list", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    listBookPersonasMock.mockResolvedValue([
      {
        id           : "persona-1",
        profileId    : "profile-1",
        bookId,
        name         : "周进",
        localName    : "周进",
        aliases      : ["周学道"],
        gender       : "男",
        hometown     : "会稽",
        nameType     : NameType.NAMED,
        globalTags   : ["儒生"],
        localTags    : ["清苦"],
        officialTitle: null,
        localSummary : null,
        ironyIndex   : 0,
        confidence   : 1,
        recordSource : RecordSource.MANUAL,
        status       : ProcessingStatus.VERIFIED
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_PERSONAS_FETCHED");
    expect(listBookPersonasMock).toHaveBeenCalledWith(bookId);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid book id", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/books/invalid/personas"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    expect(listBookPersonasMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the book does not exist", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    listBookPersonasMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 500 when listing personas fails unexpectedly", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    listBookPersonasMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/books/:id/personas", () => {
  afterEach(() => {
    listBookPersonasMock.mockReset();
    createBookPersonaMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates a manual persona", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    createBookPersonaMock.mockResolvedValue({
      id           : "persona-1",
      profileId    : "profile-1",
      bookId,
      name         : "周进",
      localName    : "周进",
      aliases      : ["周学道"],
      gender       : "男",
      hometown     : "会稽",
      nameType     : NameType.NAMED,
      globalTags   : ["儒生"],
      localTags    : ["清苦"],
      localSummary : null,
      officialTitle: null,
      ironyIndex   : 0,
      confidence   : 1,
      recordSource : RecordSource.MANUAL,
      status       : ProcessingStatus.VERIFIED
    });
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name   : "周进",
        aliases: ["周学道"]
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.code).toBe("BOOK_PERSONA_CREATED");
    expect(createBookPersonaMock).toHaveBeenCalledWith(bookId, {
      name   : "周进",
      aliases: ["周学道"]
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer creates persona", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        name: "周进"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(403);
    expect(createBookPersonaMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name: ""
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(400);
    expect(createBookPersonaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when route params are invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/books/invalid/personas", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name: "周进"
      })
    }), { params: Promise.resolve({ id: "invalid" }) });

    expect(response.status).toBe(400);
    expect(createBookPersonaMock).not.toHaveBeenCalled();
  });

  it("returns 404 when creating a persona for a missing book", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    createBookPersonaMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name: "周进"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 500 when persona creation fails unexpectedly", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    createBookPersonaMock.mockRejectedValue(new Error("db unavailable"));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name: "周进"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
