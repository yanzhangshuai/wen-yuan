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

  class BookSourceFileMissingError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book source file is missing: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return {
    getChapterPreview: getChapterPreviewMock,
    BookNotFoundError,
    BookSourceFileMissingError
  };
});

/**
 * 文件定位（Next.js 动态路由接口单测）：
 * - 对应 `app/api/books/[id]/chapters/preview/route.ts`，用于预览章节切分结果。
 * - 该接口通常在“导入书籍后、正式入库前”的预检查步骤调用，帮助运营确认切分质量。
 *
 * Next.js 语义：
 * - `[id]` 来自动态 params；Route Handler 在服务端执行，本测试直接调用导出的 `GET` 方法。
 */
describe("GET /api/books/:id/chapters/preview", () => {
  afterEach(() => {
    // 重置 mock，避免某个异常分支残留影响后续成功断言。
    getChapterPreviewMock.mockReset();
  });

  it("returns chapter split preview", async () => {
    // 成功分支：保证路由把 bookId 传给服务并返回标准成功码，供前端展示章节预览列表。
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
    // 参数防御：非法 id 在入口层被拒绝，减少无意义服务调用与潜在日志噪声。
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

  it("returns 400 when book source file is missing", async () => {
    // 业务异常映射：当源文件丢失时，返回可理解的 400 语义，提示前端用户重新上传或修复资源。
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookSourceFileMissingError } = await import("@/server/modules/books/getChapterPreview");
    getChapterPreviewMock.mockRejectedValue(new BookSourceFileMissingError(bookId));
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
