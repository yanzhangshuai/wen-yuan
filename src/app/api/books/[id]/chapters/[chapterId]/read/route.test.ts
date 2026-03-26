import { afterEach, describe, expect, it, vi } from "vitest";

const readChapterMock = vi.fn();

vi.mock("@/server/modules/books/readChapter", () => {
  class ChapterNotFoundError extends Error {
    readonly chapterId: string;
    readonly bookId   : string;

    constructor(bookId: string, chapterId: string) {
      super(`Chapter not found: ${chapterId} (book: ${bookId})`);
      this.chapterId = chapterId;
      this.bookId = bookId;
    }
  }

  class ParaIndexOutOfRangeError extends Error {
    readonly paraIndex: number;
    readonly maxIndex : number;

    constructor(paraIndex: number, maxIndex: number) {
      super(`paraIndex out of range: ${paraIndex}, max: ${maxIndex}`);
      this.paraIndex = paraIndex;
      this.maxIndex = maxIndex;
    }
  }

  return {
    readChapter: readChapterMock,
    ChapterNotFoundError,
    ParaIndexOutOfRangeError
  };
});

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

describe("GET /api/books/:id/chapters/:chapterId/read", () => {
  afterEach(() => {
    readChapterMock.mockReset();
  });

  it("returns chapter read snapshot", async () => {
    const bookId = "633e3968-00af-4dd6-b7f7-e21f8ca619b0";
    const chapterId = "95dd333c-dfee-4f8b-bf16-9549cb4435aa";
    readChapterMock.mockResolvedValue({
      bookId,
      chapterId,
      chapterNo        : 1,
      chapterTitle     : "第一回",
      selectedParaIndex: 0,
      highlight        : "范进",
      paragraphs       : [
        { index: 0, text: "范进进学。", containsHighlight: true }
      ]
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/${chapterId}/read?paraIndex=0&highlight=%E8%8C%83%E8%BF%9B`),
      {
        params: Promise.resolve({
          id: bookId,
          chapterId
        })
      }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_CHAPTER_READ");
    expect(readChapterMock).toHaveBeenCalledWith({
      bookId,
      chapterId,
      paraIndex: 0,
      highlight: "范进"
    });
  });

  it("returns 400 when route params are invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/books/invalid/chapters/invalid/read"),
      {
        params: Promise.resolve({
          id       : "invalid",
          chapterId: "invalid"
        })
      }
    );

    expect(response.status).toBe(400);
    expect(readChapterMock).not.toHaveBeenCalled();
  });

  it("returns 400 when paraIndex is invalid", async () => {
    const bookId = "633e3968-00af-4dd6-b7f7-e21f8ca619b0";
    const chapterId = "95dd333c-dfee-4f8b-bf16-9549cb4435aa";
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/${chapterId}/read?paraIndex=-1`),
      {
        params: Promise.resolve({
          id: bookId,
          chapterId
        })
      }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(readChapterMock).not.toHaveBeenCalled();
  });

  it("returns 404 when book is missing", async () => {
    const bookId = "633e3968-00af-4dd6-b7f7-e21f8ca619b0";
    const chapterId = "95dd333c-dfee-4f8b-bf16-9549cb4435aa";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    readChapterMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/${chapterId}/read`),
      {
        params: Promise.resolve({
          id: bookId,
          chapterId
        })
      }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 404 when chapter is missing", async () => {
    const bookId = "633e3968-00af-4dd6-b7f7-e21f8ca619b0";
    const chapterId = "95dd333c-dfee-4f8b-bf16-9549cb4435aa";
    const { ChapterNotFoundError } = await import("@/server/modules/books/readChapter");
    readChapterMock.mockRejectedValue(new ChapterNotFoundError(bookId, chapterId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/${chapterId}/read`),
      {
        params: Promise.resolve({
          id: bookId,
          chapterId
        })
      }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 400 when paraIndex is out of range", async () => {
    const bookId = "633e3968-00af-4dd6-b7f7-e21f8ca619b0";
    const chapterId = "95dd333c-dfee-4f8b-bf16-9549cb4435aa";
    const { ParaIndexOutOfRangeError } = await import("@/server/modules/books/readChapter");
    readChapterMock.mockRejectedValue(new ParaIndexOutOfRangeError(5, 2));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/chapters/${chapterId}/read?paraIndex=5`),
      {
        params: Promise.resolve({
          id: bookId,
          chapterId
        })
      }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });
});
