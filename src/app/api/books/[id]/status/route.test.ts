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

describe("GET /api/books/:id/status", () => {
  afterEach(() => {
    getBookStatusMock.mockReset();
  });

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
