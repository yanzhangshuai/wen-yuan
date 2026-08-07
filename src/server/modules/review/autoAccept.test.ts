/**
 * 被测对象：autoAccept（自动接受栈）。
 * 测试目标：五条件判定 → VERIFIED+AUTO_VERIFIED 落库 / 保留 DRAFT + 缺失条件。
 * 覆盖范围：全过接受 / 各条件失败 / 无 DRAFT 事实。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { acceptFactsForJob } from "./autoAccept";
import { getRegistry } from "@/server/modules/identity/registry";
import { isNameInText } from "@/server/modules/extraction/guardrails";

vi.mock("@/server/modules/identity/registry", () => ({
  getRegistry: vi.fn()
}));
vi.mock("@/server/modules/extraction/guardrails", () => ({
  isNameInText: vi.fn()
}));

const mockGetRegistry = vi.mocked(getRegistry);
const mockIsNameInText = vi.mocked(isNameInText);

/** 构造通过全部条件的事实行（返回给 findMany 的 mock 值）。 */
function makeFact(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id                  : "fact-1",
    sourceEntityId      : "entity-1",
    targetEntityId      : "entity-2",
    relationshipTypeCode: "父子",
    evidence            : "范进是周进的座师",
    chapter             : { content: "范进中了秀才，周学道提携了他。" },
    sourceEntity        : { name: "范进", aliases: ["范老爷"] },
    targetEntity        : { name: "周进", aliases: ["周学道"] },
    ...overrides
  };
}

function makeRegistry() {
  return {
    bookId  : "book-1",
    loadedAt: new Date(),
    entries : [
      { entityId: "entity-1", canonical: "范进", type: "PERSON", aliases: ["范老爷"], confidenceTier: "HIGH", activeChapters: [3], firstAppearanceChapter: 1, nameType: "NAMED" },
      { entityId: "entity-2", canonical: "周进", type: "PERSON", aliases: ["周学道"], confidenceTier: "HIGH", activeChapters: [3], firstAppearanceChapter: 1, nameType: "NAMED" }
    ]
  };
}

const prisma = {
  analysisJob: { findUnique: vi.fn() },
  fact       : { findMany: vi.fn(), updateMany: vi.fn() },
  mention    : { count: vi.fn() }
};

beforeEach(() => {
  vi.clearAllMocks();
  mockGetRegistry.mockResolvedValue(makeRegistry() as never);
  mockIsNameInText.mockReturnValue(true);
  prisma.analysisJob.findUnique.mockResolvedValue({
    id                       : "job-1",
    bookId                   : "book-1",
    relationshipTypesSnapshot: [{ code: "父子", direction: "INVERSE", category: "家庭" }]
  });
});

describe("acceptFactsForJob", () => {
  it("五条件全过 → 事实更新为 VERIFIED + AUTO_VERIFIED", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([makeFact()]);
    prisma.mention.count.mockResolvedValue(3);

    // Act
    const result = await acceptFactsForJob("job-1", prisma as never);

    // Assert
    expect(result.accepted).toEqual(["fact-1"]);
    expect(result.rejected).toEqual([]);
    expect(prisma.fact.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["fact-1"] } },
      data : expect.objectContaining({
        status      : "VERIFIED",
        recordSource: "AUTO_VERIFIED"
      })
    }));
  });

  it("证据锚定失败 → 保留 DRAFT，rejectReasons 含 evidence_anchor", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([makeFact()]);
    prisma.mention.count.mockResolvedValue(3);
    mockIsNameInText.mockReturnValue(false);

    // Act
    const result = await acceptFactsForJob("job-1", prisma as never);

    // Assert
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual(["fact-1"]);
    expect(result.rejectReasons["fact-1"]).toContain("evidence_anchor");
    expect(prisma.fact.updateMany).not.toHaveBeenCalled();
  });

  it("登记表非 HIGH → 保留 DRAFT，rejectReasons 含 registry_not_high", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([makeFact()]);
    prisma.mention.count.mockResolvedValue(3);
    mockGetRegistry.mockResolvedValue({
      bookId  : "book-1",
      loadedAt: new Date(),
      entries : [
        { entityId: "entity-1", canonical: "范进", type: "PERSON", aliases: [], confidenceTier: "LOW", activeChapters: [], firstAppearanceChapter: null, nameType: "NAMED" },
        { entityId: "entity-2", canonical: "周进", type: "PERSON", aliases: [], confidenceTier: "HIGH", activeChapters: [], firstAppearanceChapter: null, nameType: "NAMED" }
      ]
    } as never);

    // Act
    const result = await acceptFactsForJob("job-1", prisma as never);

    // Assert
    expect(result.rejectReasons["fact-1"]).toContain("registry_not_high");
  });

  it("提及数不足 → rejectReasons 含 mention_lt_2", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([makeFact()]);
    prisma.mention.count.mockResolvedValue(1);

    // Act
    const result = await acceptFactsForJob("job-1", prisma as never);

    // Assert
    expect(result.rejectReasons["fact-1"]).toContain("mention_lt_2");
  });

  it("关系码不在契约闭集 → rejectReasons 含 contract_invalid", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([makeFact({ relationshipTypeCode: "师徒" })]);
    prisma.mention.count.mockResolvedValue(3);

    // Act
    const result = await acceptFactsForJob("job-1", prisma as never);

    // Assert
    expect(result.rejectReasons["fact-1"]).toContain("contract_invalid");
  });

  it("无 DRAFT 事实 → 返回空接受/拒绝，不触发 updateMany", async () => {
    // Arrange
    prisma.fact.findMany.mockResolvedValue([]);

    // Act
    const result = await acceptFactsForJob("job-1", prisma as never);

    // Assert
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([]);
    expect(prisma.fact.updateMany).not.toHaveBeenCalled();
  });

  it("job 不存在 → 抛错", async () => {
    // Arrange
    prisma.analysisJob.findUnique.mockResolvedValue(null);

    // Act + Assert
    await expect(acceptFactsForJob("missing", prisma as never)).rejects.toThrow("分析任务不存在");
  });
});
