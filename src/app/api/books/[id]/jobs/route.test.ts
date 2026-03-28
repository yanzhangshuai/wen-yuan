import { afterEach, describe, expect, it, vi } from "vitest";

const listBookAnalysisJobsMock = vi.fn();

vi.mock("@/server/modules/analysis/jobs/listBookAnalysisJobs", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return {
    listBookAnalysisJobs: listBookAnalysisJobsMock,
    BookNotFoundError
  };
});

describe("GET /api/books/:id/jobs", () => {
  afterEach(() => {
    listBookAnalysisJobsMock.mockReset();
  });

  it("returns job list with 200", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const jobs = [
      {
        id            : "job-1",
        status        : "SUCCEEDED",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: [],
        attempt       : 1,
        errorLog      : null,
        startedAt     : "2025-03-28T09:55:00.000Z",
        finishedAt    : "2025-03-28T09:58:00.000Z",
        createdAt     : "2025-03-28T09:55:00.000Z",
        aiModelName   : "gpt-4o"
      }
    ];
    listBookAnalysisJobsMock.mockResolvedValue(jobs);
    const { GET } = await import("@/app/api/books/[id]/jobs/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/jobs`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_JOBS_FETCHED");
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toMatchObject({ id: "job-1", status: "SUCCEEDED" });
    expect(listBookAnalysisJobsMock).toHaveBeenCalledWith(bookId);
  });

  it("returns 400 when id is invalid", async () => {
    // Arrange
    const { GET } = await import("@/app/api/books/[id]/jobs/route");

    // Act
    const response = await GET(
      new Request("http://localhost/api/books/not-a-uuid/jobs"),
      { params: Promise.resolve({ id: "not-a-uuid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(listBookAnalysisJobsMock).not.toHaveBeenCalled();
  });

  it("returns 404 when book is not found", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/analysis/jobs/listBookAnalysisJobs");
    listBookAnalysisJobsMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("@/app/api/books/[id]/jobs/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/jobs`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("书籍不存在");
  });

  it("returns 500 on unexpected error", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    listBookAnalysisJobsMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("@/app/api/books/[id]/jobs/route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/jobs`),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
