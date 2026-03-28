import { afterEach, describe, expect, it, vi } from "vitest";
import { AppRole } from "@/generated/prisma/enums";

const createBookMock = vi.fn();
const listBooksMock = vi.fn();

vi.mock("@/server/modules/books/createBook", () => ({
  createBook: createBookMock
}));
vi.mock("@/server/modules/books/listBooks", () => ({
  listBooks: listBooksMock
}));

describe("POST /api/books", () => {
  afterEach(() => {
    createBookMock.mockReset();
    listBooksMock.mockReset();
  });

  it("creates a book from a txt upload and returns 201", async () => {
    // Arrange
    createBookMock.mockResolvedValue({
      id         : "book-1",
      title      : "儒林外史",
      author     : "吴敬梓",
      dynasty    : "清",
      description: "群像小说",
      status     : "PENDING",
      sourceFile : {
        key : "books/book-1/source/original.txt",
        url : "/api/assets/books/book-1/source/original.txt",
        name: "rulin.txt",
        mime: "text/plain; charset=utf-8",
        size: 12
      }
    });

    const formData = new FormData();
    formData.set("title", "儒林外史");
    formData.set("author", "吴敬梓");
    formData.set("file", new File(["第一回 ..."], "rulin.txt", { type: "text/plain" }));

    const { POST } = await import("@/app/api/books/route");

    // Act
    const response = await POST(new Request("http://localhost/api/books", {
      method : "POST",
      headers: {
        "x-auth-role": AppRole.ADMIN
      },
      body: formData
    }));

    // Assert
    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_CREATED");
    expect(createBookMock).toHaveBeenCalledWith(expect.objectContaining({
      title   : "儒林外史",
      author  : "吴敬梓",
      fileName: "rulin.txt"
    }));
  });

  it("falls back to GB18030 decoding when UTF-8 decoding fails", async () => {
    // Arrange: "中文" 的 GBK/GB18030 字节
    createBookMock.mockResolvedValue({
      id         : "book-2",
      title      : "测试",
      author     : null,
      dynasty    : null,
      description: null,
      status     : "PENDING",
      sourceFile : {
        key : "books/book-2/source/original.txt",
        url : "/api/assets/books/book-2/source/original.txt",
        name: "gbk.txt",
        mime: "text/plain; charset=utf-8",
        size: 4
      }
    });

    const gbkBytes = new Uint8Array([0xD6, 0xD0, 0xCE, 0xC4]);
    const formData = new FormData();
    formData.set("title", "测试");
    formData.set("file", new File([gbkBytes], "gbk.txt", { type: "text/plain" }));

    const { POST } = await import("@/app/api/books/route");

    // Act
    const response = await POST(new Request("http://localhost/api/books", {
      method : "POST",
      headers: {
        "x-auth-role": AppRole.ADMIN
      },
      body: formData
    }));

    // Assert
    expect(response.status).toBe(201);
    expect(createBookMock).toHaveBeenCalledWith(expect.objectContaining({
      fileName   : "gbk.txt",
      fileContent: expect.any(Buffer)
    }));
  });

  it("rejects non-txt uploads with 400", async () => {
    // Arrange
    const formData = new FormData();
    formData.set("file", new File(["%PDF"], "sample.pdf", { type: "application/pdf" }));

    const { POST } = await import("@/app/api/books/route");

    // Act
    const response = await POST(new Request("http://localhost/api/books", {
      method : "POST",
      headers: {
        "x-auth-role": AppRole.ADMIN
      },
      body: formData
    }));

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("MVP 仅支持 .txt 文件导入");
    expect(createBookMock).not.toHaveBeenCalled();
  });
});

describe("GET /api/books", () => {
  afterEach(() => {
    createBookMock.mockReset();
    listBooksMock.mockReset();
  });

  it("returns library books list with 200", async () => {
    // Arrange
    listBooksMock.mockResolvedValue([
      {
        id              : "book-1",
        title           : "儒林外史",
        author          : "吴敬梓",
        dynasty         : "清",
        status          : "COMPLETED",
        chapterCount    : 56,
        personaCount    : 132,
        lastAnalyzedAt  : "2026-03-24T10:08:00.000Z",
        currentModel    : "DeepSeek V3",
        lastErrorSummary: null,
        createdAt       : "2026-03-24T09:10:00.000Z",
        updatedAt       : "2026-03-24T10:10:00.000Z",
        sourceFile      : {
          key : "books/book-1/source/original.txt",
          url : "/api/assets/books/book-1/source/original.txt",
          name: "rulin.txt",
          mime: "text/plain; charset=utf-8",
          size: 1234
        }
      }
    ]);
    const { GET } = await import("@/app/api/books/route");

    // Act
    const response = await GET();

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOKS_LISTED");
    expect(payload.data).toHaveLength(1);
    expect(payload.data[0]).toEqual(expect.objectContaining({
      id   : "book-1",
      title: "儒林外史"
    }));
    expect(listBooksMock).toHaveBeenCalledOnce();
  });

  it("returns 500 when listing books fails", async () => {
    // Arrange
    listBooksMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("@/app/api/books/route");

    // Act
    const response = await GET();

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("书库列表获取失败");
  });
});
