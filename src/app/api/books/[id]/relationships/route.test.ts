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

import { AppRole, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const listBookRelationshipsMock = vi.fn();
const createBookRelationshipMock = vi.fn();

vi.mock("@/server/modules/relationships/listBookRelationships", () => ({
  listBookRelationships: listBookRelationshipsMock
}));

vi.mock("@/server/modules/relationships/createBookRelationship", () => ({
  createBookRelationship: createBookRelationshipMock
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

vi.mock("@/server/modules/personas/errors", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return { PersonaNotFoundError };
});

vi.mock("@/server/modules/relationships/errors", () => {
  class RelationshipInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return { RelationshipInputError };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GET /api/books/:id/relationships", () => {
  afterEach(() => {
    listBookRelationshipsMock.mockReset();
    createBookRelationshipMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns relationships list", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    listBookRelationshipsMock.mockResolvedValue([
      {
        id          : "relationship-1",
        bookId,
        chapterId   : "chapter-1",
        chapterNo   : 1,
        sourceId    : "persona-1",
        sourceName  : "周进",
        targetId    : "persona-2",
        targetName  : "范进",
        type        : "师生",
        weight      : 0.8,
        description : null,
        evidence    : "周进教导范进",
        confidence  : 0.9,
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(
        `http://localhost/api/books/${bookId}/relationships?type=%E5%B8%88%E7%94%9F&status=${ProcessingStatus.VERIFIED}&source=${RecordSource.MANUAL}`
      ),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("BOOK_RELATIONSHIPS_FETCHED");
    expect(listBookRelationshipsMock).toHaveBeenCalledWith(bookId, {
      type  : "师生",
      status: ProcessingStatus.VERIFIED,
      source: RecordSource.MANUAL
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid query", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/relationships?status=UNKNOWN`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    expect(listBookRelationshipsMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when book is missing", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    listBookRelationshipsMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/relationships`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/books/:id/relationships", () => {
  afterEach(() => {
    listBookRelationshipsMock.mockReset();
    createBookRelationshipMock.mockReset();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates manual relationship", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const chapterId = "45009520-2d2b-4864-b5fa-c16d8ce4be4b";
    const sourceId = "c53ac0ff-dfd6-49fc-907d-2df562f5ed06";
    const targetId = "b694a898-9a48-4f55-b62d-b946b57d067d";
    createBookRelationshipMock.mockResolvedValue({
      id          : "relationship-1",
      bookId,
      chapterId,
      chapterNo   : 1,
      sourceId,
      targetId,
      type        : "师生",
      weight      : 1,
      description : null,
      evidence    : null,
      confidence  : 1,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    });
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/relationships`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        sourceId,
        targetId,
        type: "师生"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.code).toBe("BOOK_RELATIONSHIP_CREATED");
    expect(createBookRelationshipMock).toHaveBeenCalledWith(bookId, {
      chapterId,
      sourceId,
      targetId,
      type: "师生"
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer requests", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/relationships`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(403);
    expect(createBookRelationshipMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid body", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/relationships`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(400);
    expect(createBookRelationshipMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when persona is missing", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const chapterId = "45009520-2d2b-4864-b5fa-c16d8ce4be4b";
    const sourceId = "c53ac0ff-dfd6-49fc-907d-2df562f5ed06";
    const targetId = "b694a898-9a48-4f55-b62d-b946b57d067d";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    createBookRelationshipMock.mockRejectedValue(new PersonaNotFoundError(sourceId));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/relationships`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        sourceId,
        targetId,
        type: "师生"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when input violates business rule", async () => {
    const bookId = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
    const chapterId = "45009520-2d2b-4864-b5fa-c16d8ce4be4b";
    const sourceId = "c53ac0ff-dfd6-49fc-907d-2df562f5ed06";
    const targetId = "b694a898-9a48-4f55-b62d-b946b57d067d";
    const { RelationshipInputError } = await import("@/server/modules/relationships/errors");
    createBookRelationshipMock.mockRejectedValue(new RelationshipInputError("关系已存在"));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/relationships`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        sourceId,
        targetId,
        type: "师生"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });
});
