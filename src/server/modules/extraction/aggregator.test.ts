import { beforeEach, describe, expect, it, vi } from "vitest";
import { refreshRelationshipsForBook } from "./aggregator.ts";

// mock prisma：deleteMany / groupBy / count / create
const mockDeleteMany = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockGroupBy = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCount = vi.fn<(...args: unknown[]) => Promise<unknown>>();
const mockCreate = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    relationship: { deleteMany: (...a: unknown[]) => mockDeleteMany(...a), create: (...a: unknown[]) => mockCreate(...a) },
    fact        : { groupBy: (...a: unknown[]) => mockGroupBy(...a), count: (...a: unknown[]) => mockCount(...a) }
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("refreshRelationshipsForBook", () => {
  it("全量重建 + SYMMETRIC 规范化 + 自环丢弃", async () => {
    mockGroupBy.mockResolvedValue([
      { sourceEntityId: "b", targetEntityId: "a", relationshipTypeCode: "夫妻", _count: { _all: 2 }, _min: { chapterNo: 3 }, _max: { chapterNo: 5 } }, // SYMMETRIC，应规范化 a<b
      { sourceEntityId: "x", targetEntityId: "x", relationshipTypeCode: "朋友", _count: { _all: 1 }, _min: { chapterNo: 1 }, _max: { chapterNo: 1 } }, // 自环丢弃
      { sourceEntityId: "范", targetEntityId: "周", relationshipTypeCode: "师生", _count: { _all: 1 }, _min: { chapterNo: 2 }, _max: { chapterNo: 2 } } // INVERSE 不规范化
    ]);
    mockCount.mockResolvedValue(0);

    const edges = await refreshRelationshipsForBook("book-1");
    expect(mockDeleteMany).toHaveBeenCalledWith({ where: { bookId: "book-1" } });
    expect(edges).toHaveLength(2); // 自环被丢弃
    expect(edges[0]).toMatchObject({ sourceEntityId: "a", targetEntityId: "b", relationshipTypeCode: "夫妻", factCount: 2 });
    expect(edges[1]).toMatchObject({ sourceEntityId: "范", targetEntityId: "周", relationshipTypeCode: "师生" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("SYMMETRIC 两向分组折叠为一条边（防唯一约束冲突）", async () => {
    // a→b 与 b→a 归一化后同键：应合并为一条边（factCount 累加），create 只调用一次
    mockGroupBy.mockResolvedValue([
      { sourceEntityId: "b", targetEntityId: "a", relationshipTypeCode: "夫妻", _count: { _all: 2 }, _min: { chapterNo: 3 }, _max: { chapterNo: 5 } },
      { sourceEntityId: "a", targetEntityId: "b", relationshipTypeCode: "夫妻", _count: { _all: 3 }, _min: { chapterNo: 1 }, _max: { chapterNo: 6 } }
    ]);
    mockCount.mockResolvedValue(0);

    const edges = await refreshRelationshipsForBook("book-1");
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({ sourceEntityId: "a", targetEntityId: "b", relationshipTypeCode: "夫妻", factCount: 5 });
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("任一底层事实 VERIFIED → 边 VERIFIED", async () => {
    mockGroupBy.mockResolvedValue([
      { sourceEntityId: "a", targetEntityId: "b", relationshipTypeCode: "父子", _count: { _all: 1 }, _min: { chapterNo: 1 }, _max: { chapterNo: 1 } }
    ]);
    mockCount.mockResolvedValue(1); // 有 VERIFIED 事实
    const edges = await refreshRelationshipsForBook("book-1");
    expect(edges[0].status).toBe("VERIFIED");
  });

  it("空事实 → 无边", async () => {
    mockGroupBy.mockResolvedValue([]);
    const edges = await refreshRelationshipsForBook("book-1");
    expect(edges).toHaveLength(0);
  });
});
