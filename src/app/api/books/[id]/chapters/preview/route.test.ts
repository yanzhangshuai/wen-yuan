import { afterEach, describe, expect, it, vi } from "vitest";

const getChapterPreviewMock = vi.fn();

vi.mock("@/server/modules/books/getChapterPreview", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  class BookRawContentMissingError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book raw content is empty: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return {
    getChapterPreview: getChapterPreviewMock,
    BookNotFoundError,
    BookRawContentMissingError
  };
});

describe("GET /api/books/:id/chapters/preview", () => {
  afterEach(() => {
    getChapterPreviewMock.mockReset();
  });

  it("returns chapter split preview", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    getChapterPreviewMock.mockResolvedValue({
      bookId,
      chapterCount: 2,
      items       : [
        { index: 1, chapterType: "CHAPTER", title: "第1回", wordCount: 1000 },
        { index: 2, chapterType: "CHAPTER", title: "第2回", wordCount: 900 }
      ]
    });
    const { GET } = await import("@/app/api/books/[id]/chapters/preview/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/preview`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_CHAPTERS_PREVIEWED");
    expect(payload.data.chapterCount).toBe(2);
    expect(getChapterPreviewMock).toHaveBeenCalledWith(bookId);
  });

  it("returns 400 when book id is invalid", async () => {
    // Arrange
    const { GET } = await import("@/app/api/books/[id]/chapters/preview/route");

    // Act
    const response = await GET(
      new Request("http://localhost/api/books/invalid/chapters/preview"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    expect(getChapterPreviewMock).not.toHaveBeenCalled();
  });

  it("returns 400 when book raw content is empty", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookRawContentMissingError } = await import("@/server/modules/books/getChapterPreview");
    getChapterPreviewMock.mockRejectedValue(new BookRawContentMissingError(bookId));
    const { GET } = await import("@/app/api/books/[id]/chapters/preview/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/preview`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });
});

