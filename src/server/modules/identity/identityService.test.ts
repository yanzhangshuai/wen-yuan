import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeRegistry } from "./identityService.ts";

// mock prisma.$transaction：用一个假 tx 记录调用
vi.mock("@/server/db/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(txMock)) }
}));

// 由测试填充的假 tx（结构固定，交由 TS 推断具体类型）
const txMock = {
  entity: {
    findFirst: vi.fn(),
    create   : vi.fn(),
    update   : vi.fn()
  },
  entityProfile  : { findFirst: vi.fn(), create: vi.fn() },
  alias          : { findFirst: vi.fn(), create: vi.fn() },
  agentWriteAudit: { create: vi.fn() }
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("writeRegistry", () => {
  it("canonical 不存在 → 创建新实体 + profile + 审计", async () => {
    txMock.entity.findFirst.mockResolvedValue(null);
    txMock.entity.create.mockResolvedValue({ id: "new-1", aliases: ["范老爷"], confidence: 0.7 });
    txMock.entityProfile.findFirst.mockResolvedValue(null);
    txMock.alias.findFirst.mockResolvedValue(null);

    const result = await writeRegistry({
      bookId    : "book-1",
      source    : "tier1",
      agentRunId: "run-1",
      entries   : [{ canonical: "范进", aliases: ["范老爷"], type: "PERSON" }]
    });

    expect(result.created).toBe(1);
    expect(txMock.entity.create).toHaveBeenCalled();
    expect(txMock.entityProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ entityId: "new-1", bookId: "book-1" }) })
    );
    expect(txMock.agentWriteAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "CREATE", objectId: "new-1" }) })
    );
  });

  it("canonical 已存在 → 合并别名 + UPDATE 审计", async () => {
    txMock.entity.findFirst.mockResolvedValue({ id: "e1", aliases: ["范老爷"], confidence: 0.7 });
    txMock.entity.update.mockResolvedValue({ id: "e1", aliases: ["范老爷", "范举人"], confidence: 0.7 });
    txMock.entityProfile.findFirst.mockResolvedValue({ id: "p1" });
    txMock.alias.findFirst.mockResolvedValue(null);

    const result = await writeRegistry({
      bookId    : "book-1",
      source    : "reconcile",
      agentRunId: "run-1",
      entries   : [{ canonical: "范进", aliases: ["范举人"], type: "PERSON" }]
    });

    expect(result.updated).toBe(1);
    expect(txMock.entity.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "e1" },
        data : expect.objectContaining({ aliases: ["范老爷", "范举人"] })
      })
    );
    expect(txMock.agentWriteAudit.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ action: "UPDATE" }) })
    );
  });

  it("空 entries → 0 created/updated，无写入", async () => {
    const result = await writeRegistry({ bookId: "book-1", source: "tier2", agentRunId: "run-1", entries: [] });
    expect(result).toEqual({ created: 0, updated: 0 });
    expect(txMock.entity.create).not.toHaveBeenCalled();
  });
});
