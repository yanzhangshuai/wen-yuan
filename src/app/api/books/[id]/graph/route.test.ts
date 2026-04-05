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

/**
 * 文件定位（Next.js 动态接口路由单测）：
 * - 对应 `app/api/books/[id]/graph/route.ts`，用于返回某本书的图谱快照。
 * - `[id]` 来自动态路由参数，`chapter` 来自 query 参数，二者共同决定查询范围。
 *
 * 业务职责：
 * - 给图谱页面提供节点/边数据。
 * - 在入口层处理参数合法性与领域错误映射（如书籍不存在）。
 */
describe("GET /api/books/:id/graph", () => {
  afterEach(() => {
    // 每个用例重置 mock，确保不同错误分支不会共享调用历史。
    getBookGraphMock.mockReset();
  });

  it("returns graph snapshot", async () => {
    // 成功分支：chapter 查询参数应被解析为数字并传给服务层，实现按章节过滤。
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
    // 防御分支：章节号必须是正整数，0 或非法值都应在路由层拦截。
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
    // 错误映射：领域层 BookNotFoundError => HTTP 404，保持前后端语义一致。
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
