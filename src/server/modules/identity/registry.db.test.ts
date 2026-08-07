import { beforeEach, describe, expect, it, vi } from "vitest";
import { getRegistry, invalidateRegistryCache } from "./registry.ts";

// mock prisma.entity.findMany 返回结构化数据
const mockEntityFindMany = vi.fn<(...args: unknown[]) => Promise<unknown>>();
vi.mock("@/server/db/prisma", () => ({
  prisma: {
    entity: { findMany: (...args: unknown[]) => mockEntityFindMany(...args) }
  }
}));

beforeEach(() => {
  vi.clearAllMocks();
  invalidateRegistryCache("book-1");
});

function mention(chapterNo: number) {
  return { chapter: { no: chapterNo } };
}

describe("getRegistry 派生分类", () => {
  it("HIGH：CONFIRMED alias + 活跃章区 ≥1 + 非 TITLE_ONLY", async () => {
    mockEntityFindMany.mockResolvedValue([
      {
        id          : "e1",
        name        : "范进",
        entityType  : "PERSON",
        nameType    : "NAMED",
        aliases     : ["范老爷"],
        profiles    : [{ id: "p1" }],
        aliasRecords: [{ status: "CONFIRMED" }],
        mentions    : [mention(3), mention(4)]
      }
    ]);
    const reg = await getRegistry("book-1");
    expect(reg.entries).toHaveLength(1);
    expect(reg.entries[0].confidenceTier).toBe("HIGH");
    expect(reg.entries[0].activeChapters).toEqual([3, 4]);
  });

  it("MEDIUM：有 mentions 但无 CONFIRMED 且 <2 提及", async () => {
    mockEntityFindMany.mockResolvedValue([
      {
        id          : "e2",
        name        : "周进",
        entityType  : "PERSON",
        nameType    : "NAMED",
        aliases     : [],
        profiles    : [{ id: "p2" }],
        aliasRecords: [{ status: "PENDING" }],
        mentions    : [mention(2)]
      }
    ]);
    const reg = await getRegistry("book-1");
    expect(reg.entries[0].confidenceTier).toBe("MEDIUM");
  });

  it("TITLE_ONLY → 最高 MEDIUM（不因提及数升 HIGH）", async () => {
    mockEntityFindMany.mockResolvedValue([
      {
        id          : "e3",
        name        : "范进母",
        entityType  : "PERSON",
        nameType    : "TITLE_ONLY",
        aliases     : ["母亲"],
        profiles    : [{ id: "p3" }],
        aliasRecords: [{ status: "CONFIRMED" }],
        mentions    : [mention(3), mention(4), mention(5)]
      }
    ]);
    const reg = await getRegistry("book-1");
    expect(reg.entries[0].confidenceTier).not.toBe("HIGH");
  });

  it("无 mentions/aliases → LOW", async () => {
    mockEntityFindMany.mockResolvedValue([
      {
        id          : "e4",
        name        : "姚驼子",
        entityType  : "PERSON",
        nameType    : "NAMED",
        aliases     : [],
        profiles    : [{ id: "p4" }],
        aliasRecords: [],
        mentions    : []
      }
    ]);
    const reg = await getRegistry("book-1");
    expect(reg.entries[0].confidenceTier).toBe("LOW");
  });

  it("缓存：二次调用不重复查库", async () => {
    mockEntityFindMany.mockResolvedValue([]);
    await getRegistry("book-1");
    await getRegistry("book-1");
    expect(mockEntityFindMany).toHaveBeenCalledTimes(1);
  });
});
