import { afterEach, describe, expect, it, vi } from "vitest";

const getBookGraphMock = vi.fn();

vi.mock("@/server/modules/books/getBookGraph", () => ({
  getBookGraph: getBookGraphMock
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

describe("GET /api/books/:id/graph", () => {
  afterEach(() => {
    getBookGraphMock.mockReset();
  });

  it("returns graph snapshot", async () => {
    const bookId = "36660de7-2ec6-4f73-ab2b-06fa8d7f8544";
    getBookGraphMock.mockResolvedValue({
      nodes: [
        {
          id          : "persona-1",
          name        : "周进",
          nameType    : "NAMED",
          status      : "DRAFT",
          factionIndex: 3,
          influence   : 8
        }
      ],
      edges: []
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/graph?chapter=3`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_GRAPH_FETCHED");
    expect(getBookGraphMock).toHaveBeenCalledWith({
      bookId,
      chapter: 3
    });
  });

  it("returns 400 for invalid chapter query", async () => {
    const bookId = "36660de7-2ec6-4f73-ab2b-06fa8d7f8544";
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/graph?chapter=0`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(getBookGraphMock).not.toHaveBeenCalled();
  });

  it("returns 404 when book is missing", async () => {
    const bookId = "36660de7-2ec6-4f73-ab2b-06fa8d7f8544";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    getBookGraphMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/graph`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
