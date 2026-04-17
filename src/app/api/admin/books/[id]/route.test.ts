/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/books/[id]/route.ts`。
 * - 覆盖 PATCH 更新 `typeCode` 的鉴权、参数校验、枚举校验与服务层错误映射。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getBookByIdMock = vi.fn<(bookId: string) => Promise<unknown>>();
const updateBookTypeCodeMock = vi.fn<(bookId: string, typeCode: string) => Promise<unknown>>();

class BookNotFoundError extends Error {
  readonly bookId: string;

  constructor(bookId: string) {
    super(`Book not found: ${bookId}`);
    this.bookId = bookId;
  }
}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/books/errors", () => ({
  BookNotFoundError
}));

vi.mock("@/server/modules/books/getBookById", () => ({
  getBookById: (bookId: string) => getBookByIdMock(bookId)
}));

vi.mock("@/server/modules/books/updateBookTypeCode", () => ({
  updateBookTypeCode: (bookId: string, typeCode: string) => updateBookTypeCodeMock(bookId, typeCode)
}));

const validBookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

describe("PATCH /api/admin/books/:id", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    updateBookTypeCodeMock.mockReset();
    getBookByIdMock.mockReset();
    vi.resetModules();
  });

  it("updates typeCode and returns 200", async () => {
    // Arrange
    updateBookTypeCodeMock.mockResolvedValue({
      id       : validBookId,
      title    : "儒林外史",
      typeCode : "CLASSICAL_NOVEL",
      updatedAt: "2026-04-17T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    // Act
    const response = await PATCH(
      new Request(`http://localhost/api/admin/books/${validBookId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ typeCode: "CLASSICAL_NOVEL" })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_BOOK_UPDATED");
    expect(payload.data.typeCode).toBe("CLASSICAL_NOVEL");
    expect(updateBookTypeCodeMock).toHaveBeenCalledWith(validBookId, "CLASSICAL_NOVEL");
  });

  it("returns 400 for invalid typeCode enum value", async () => {
    // Arrange
    const { PATCH } = await import("./route");

    // Act
    const response = await PATCH(
      new Request(`http://localhost/api/admin/books/${validBookId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ typeCode: "NOT_A_REAL_TYPE" })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("BookTypeCode 取值不合法");
    expect(updateBookTypeCodeMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid route params", async () => {
    // Arrange
    const { PATCH } = await import("./route");

    // Act
    const response = await PATCH(
      new Request("http://localhost/api/admin/books/not-uuid", {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ typeCode: "GENERIC" })
      }),
      { params: Promise.resolve({ id: "not-uuid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.detail).toBe("书籍 ID 不合法");
  });

  it("returns 403 when auth guard fails", async () => {
    // Arrange
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PATCH } = await import("./route");

    // Act
    const response = await PATCH(
      new Request(`http://localhost/api/admin/books/${validBookId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ typeCode: "GENERIC" })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(403);
    expect(updateBookTypeCodeMock).not.toHaveBeenCalled();
  });

  it("returns 404 when book does not exist", async () => {
    // Arrange
    updateBookTypeCodeMock.mockRejectedValue(new BookNotFoundError(validBookId));
    const { PATCH } = await import("./route");

    // Act
    const response = await PATCH(
      new Request(`http://localhost/api/admin/books/${validBookId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ typeCode: "HEROIC_NOVEL" })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 500 when service throws unexpected error", async () => {
    // Arrange
    updateBookTypeCodeMock.mockRejectedValue(new Error("db unavailable"));
    const { PATCH } = await import("./route");

    // Act
    const response = await PATCH(
      new Request(`http://localhost/api/admin/books/${validBookId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ typeCode: "GENERIC" })
      }),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});

describe("GET /api/admin/books/:id", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getBookByIdMock.mockReset();
    vi.resetModules();
  });

  it("returns book detail with 200", async () => {
    // Arrange
    getBookByIdMock.mockResolvedValue({
      id      : validBookId,
      title   : "儒林外史",
      typeCode: "CLASSICAL_NOVEL"
    });
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("ADMIN_BOOK_FETCHED");
    expect(payload.data.typeCode).toBe("CLASSICAL_NOVEL");
  });

  it("returns 404 when book missing", async () => {
    // Arrange
    getBookByIdMock.mockRejectedValue(new BookNotFoundError(validBookId));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
  });
});
