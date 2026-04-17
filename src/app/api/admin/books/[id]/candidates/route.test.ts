/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 验证 `GET /api/admin/books/:id/candidates` 契约稳定性。
 *
 * 测试目标：
 * - 鉴权：仅 ADMIN 可访问，VIEWER 返 403；
 * - 参数校验：非 UUID 返 400；
 * - 业务映射：书籍不存在返 404，异常返 500；
 * - 查询契约：WHERE 条件命中 `status=CANDIDATE` + 所属书籍；
 * - 分页契约：`page/page_size` 解析 & meta.pagination 回包；
 * - 搜索契约：`q` 子串命中 name.contains；
 * - 排序契约：mentionCount desc。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const findFirstBookMock = vi.fn();
const findManyPersonaMock = vi.fn();
const countPersonaMock = vi.fn();

class BookNotFoundError extends Error {
  readonly bookId: string;
  constructor(bookId: string) {
    super(`Book not found: ${bookId}`);
    this.bookId = bookId;
  }
}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/books/errors", () => ({
  BookNotFoundError
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    book: {
      findFirst: (args: unknown) => findFirstBookMock(args) as Promise<unknown>
    },
    persona: {
      findMany: (args: unknown) => findManyPersonaMock(args) as Promise<unknown>,
      count   : (args: unknown) => countPersonaMock(args) as Promise<unknown>
    }
  }
}));

describe("GET /api/admin/books/:id/candidates", () => {
  const validBookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
    findFirstBookMock.mockResolvedValue({ id: validBookId });
  });

  afterEach(() => {
    headersMock.mockReset();
    findFirstBookMock.mockReset();
    findManyPersonaMock.mockReset();
    countPersonaMock.mockReset();
    vi.resetModules();
  });

  it("returns paginated candidates with 200 and KPI-ready total", async () => {
    findManyPersonaMock.mockResolvedValue([
      {
        id                     : "p1",
        name                   : "诸葛亮",
        mentionCount           : 42,
        distinctChapters       : 10,
        effectiveBiographyCount: 5,
        createdAt              : new Date("2026-04-17T01:00:00.000Z"),
        aliasMappings          : [{ alias: "孔明" }, { alias: "卧龙" }, { alias: "武侯" }],
        _count                 : { aliasMappings: 4 }
      }
    ]);
    countPersonaMock.mockResolvedValue(123);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/candidates?page=2&page_size=50`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_BOOK_CANDIDATES_FETCHED");
    expect(payload.data).toEqual([
      {
        id                     : "p1",
        canonicalName          : "诸葛亮",
        mentionCount           : 42,
        distinctChapters       : 10,
        effectiveBiographyCount: 5,
        aliasesPreview         : ["孔明", "卧龙", "武侯"],
        aliasesTotal           : 4,
        createdAt              : "2026-04-17T01:00:00.000Z"
      }
    ]);
    expect(payload.meta?.pagination).toEqual({ page: 2, pageSize: 50, total: 123 });

    // 断言查询契约：WHERE status=CANDIDATE + profiles.some.bookId + skip/take + orderBy。
    const call = findManyPersonaMock.mock.calls[0][0];
    expect(call.where.status).toBe("CANDIDATE");
    expect(call.where.profiles).toEqual({ some: { bookId: validBookId, deletedAt: null } });
    expect(call.where.deletedAt).toBeNull();
    expect(call.skip).toBe(50);
    expect(call.take).toBe(50);
    expect(call.orderBy).toEqual([{ mentionCount: "desc" }, { createdAt: "desc" }]);
  });

  it("returns 403 when auth guard fails (viewer cannot see candidates)", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/candidates`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(findManyPersonaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when route id is not a UUID", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/books/invalid/candidates"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("书籍 ID 不合法");
    expect(findManyPersonaMock).not.toHaveBeenCalled();
  });

  it("returns 404 when book does not exist", async () => {
    findFirstBookMock.mockResolvedValue(null);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/candidates`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("书籍不存在");
    expect(findManyPersonaMock).not.toHaveBeenCalled();
  });

  it("applies q substring filter via name.contains (case-insensitive)", async () => {
    findManyPersonaMock.mockResolvedValue([]);
    countPersonaMock.mockResolvedValue(0);
    const { GET } = await import("./route");

    await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/candidates?q=%E8%AF%B8%E8%91%9B`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    const call = findManyPersonaMock.mock.calls[0][0];
    expect(call.where.name).toEqual({ contains: "诸葛", mode: "insensitive" });
  });

  it("defaults pagination to page=1,page_size=20 when omitted", async () => {
    findManyPersonaMock.mockResolvedValue([]);
    countPersonaMock.mockResolvedValue(0);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/candidates`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    expect(response.status).toBe(200);
    const call = findManyPersonaMock.mock.calls[0][0];
    expect(call.skip).toBe(0);
    expect(call.take).toBe(20);
    const payload = await response.json();
    expect(payload.meta.pagination).toEqual({ page: 1, pageSize: 20, total: 0 });
  });

  it("returns 500 when prisma throws unexpectedly", async () => {
    findManyPersonaMock.mockRejectedValue(new Error("db down"));
    countPersonaMock.mockResolvedValue(0);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${validBookId}/candidates`),
      { params: Promise.resolve({ id: validBookId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("候选人物列表获取失败");
  });
});
