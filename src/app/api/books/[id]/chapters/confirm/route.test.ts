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

  class BookRawContentMissingError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book raw content is empty: ${bookId}`);
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
    BookRawContentMissingError,
    ChapterConfirmPayloadError
  };
});

describe("POST /api/books/:id/chapters/confirm", () => {
  afterEach(() => {
    confirmBookChaptersMock.mockReset();
    vi.resetModules();
  });

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

  it("maps raw content missing to 400", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookRawContentMissingError } = await import("@/server/modules/books/confirmBookChapters");
    confirmBookChaptersMock.mockRejectedValue(new BookRawContentMissingError(bookId));
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
