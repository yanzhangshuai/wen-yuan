/**
 * 被测对象：reviewQueue（人审队列）。
 * 测试目标：DRAFT 事实按异常类型归类进人审队列。
 * 覆盖范围：TITLE_ONLY 泛称 / 低置信新实体 / 正常跳过 / 类型过滤。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { listReviewQueue } from "./reviewQueue";

const prisma = {
  fact: { findMany: vi.fn() }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listReviewQueue", () => {
  it("TITLE_ONLY 泛称事实进人审队列", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([{
      id          : "fact-1",
      confidence  : 0.9,
      evidence    : "老爷是本书主角",
      sourceEntity: { name: "老爷", nameType: "TITLE_ONLY" },
      targetEntity: null,
      recordSource: "DRAFT_AI"
    }]);

    // Act
    const result = await listReviewQueue({ bookId: "book-1" }, prisma as never);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ factId: "fact-1", type: "title_only_generic" });
  });

  it("低置信新实体进人审队列", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([{
      id          : "fact-2",
      confidence  : 0.4,
      evidence    : "杜少卿是扬州名士",
      sourceEntity: { name: "杜少卿", nameType: "NAMED" },
      targetEntity: null,
      recordSource: "DRAFT_AI"
    }]);

    // Act
    const result = await listReviewQueue({ bookId: "book-1" }, prisma as never);

    // Assert
    expect(result[0]).toMatchObject({ factId: "fact-2", type: "low_confidence_new" });
  });

  it("高置信具名事实不进人审队列", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([{
      id          : "fact-3",
      confidence  : 0.95,
      evidence    : "范进中举，周学道提携",
      sourceEntity: { name: "范进", nameType: "NAMED" },
      targetEntity: { name: "周进", nameType: "NAMED" },
      recordSource: "DRAFT_AI"
    }]);

    // Act
    const result = await listReviewQueue({ bookId: "book-1" }, prisma as never);

    // Assert
    expect(result).toEqual([]);
  });

  it("按类型过滤只返回该类型", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([
      { id: "fact-1", confidence: 0.9, evidence: "x", sourceEntity: { name: "老爷", nameType: "TITLE_ONLY" }, targetEntity: null, recordSource: "DRAFT_AI" },
      { id: "fact-2", confidence: 0.4, evidence: "y", sourceEntity: { name: "杜少卿", nameType: "NAMED" }, targetEntity: null, recordSource: "DRAFT_AI" }
    ]);

    // Act
    const result = await listReviewQueue({ bookId: "book-1", type: "low_confidence_new" }, prisma as never);

    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].factId).toBe("fact-2");
  });
});
