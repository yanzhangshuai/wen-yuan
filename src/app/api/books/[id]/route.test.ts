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

describe("GET /api/books/:id", () => {
  afterEach(() => {
    getBookByIdMock.mockReset();
    deleteBookMock.mockReset();
  });

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

describe("DELETE /api/books/:id", () => {
  afterEach(() => {
    getBookByIdMock.mockReset();
    deleteBookMock.mockReset();
  });

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
