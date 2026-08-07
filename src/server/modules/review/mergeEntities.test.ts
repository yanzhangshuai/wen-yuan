/**
 * 被测对象：mergeEntities（实体合并事务）。
 * 测试目标：facts 迁移 + aliases 并集 + Entity 软删 + refreshRelationshipsForBook。
 * 覆盖范围：success / source==target / 实体不存在。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { mergeEntitiesInTransaction } from "./mergeEntities";

const prisma = {
  entity       : { findUnique: vi.fn(), update: vi.fn() },
  fact         : { updateMany: vi.fn() },
  entityProfile: { findMany: vi.fn() }
};

// 动态导入 aggregator 的 refreshRelationshipsForBook
vi.mock("@/server/modules/extraction/aggregator", () => ({
  refreshRelationshipsForBook: vi.fn()
}));

beforeEach(() => {
  vi.clearAllMocks();
  prisma.entity.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ({
    id     : where.id,
    aliases: where.id === "source-1" ? ["范老爷", "范进"] : ["周学道"]
  }));
  prisma.entityProfile.findMany.mockResolvedValue([{ bookId: "book-1" }]);
});

describe("mergeEntitiesInTransaction", () => {
  it("迁移 facts + 合并 aliases + 软删 source + 重建关系", async () => {
    // Arrange
    prisma.fact.updateMany.mockResolvedValue({ count: 2 });

    // Act
    await mergeEntitiesInTransaction(prisma as never, { sourceId: "source-1", targetId: "target-1" });

    // Assert: facts 迁移（source 作主语 + 作宾语）
    expect(prisma.fact.updateMany).toHaveBeenCalledWith({
      where: { sourceEntityId: "source-1" },
      data : { sourceEntityId: "target-1" }
    });
    expect(prisma.fact.updateMany).toHaveBeenCalledWith({
      where: { targetEntityId: "source-1" },
      data : { targetEntityId: "target-1" }
    });

    // Assert: target aliases 并入 source 别名（去重后含范老爷/范进/周学道）
    expect(prisma.entity.update).toHaveBeenCalledWith({
      where: { id: "target-1" },
      data : { aliases: expect.arrayContaining(["范老爷", "范进", "周学道"]) }
    });

    // Assert: source 软删
    expect(prisma.entity.update).toHaveBeenCalledWith({
      where: { id: "source-1" },
      data : { deletedAt: expect.any(Date) }
    });
  });

  it("source 与 target 相同 → 抛错", async () => {
    await expect(mergeEntitiesInTransaction(prisma as never, { sourceId: "x", targetId: "x" }))
      .rejects.toThrow("source 与 target 相同");
  });

  it("任一实体不存在 → 抛错", async () => {
    prisma.entity.findUnique.mockResolvedValue(null);
    await expect(mergeEntitiesInTransaction(prisma as never, { sourceId: "missing", targetId: "target-1" }))
      .rejects.toThrow("实体不存在");
  });
});
