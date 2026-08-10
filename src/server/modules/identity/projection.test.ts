import { beforeEach, describe, expect, it, vi } from "vitest";
import { writeRegistry } from "./identityService.ts";
import { runProjection } from "./projection.ts";

// mock prisma 单例：本地 vi.fn() 对象（类型独立于 PrismaClient，规避 unbound-method）
const { mockPrisma } = vi.hoisted(() => {
  const mockPrisma = {
    $transaction: vi.fn(),
    entity      : { findFirst: vi.fn(), update: vi.fn() },
    fact        : { updateMany: vi.fn() },
    mention     : { updateMany: vi.fn() },
    alias       : { updateMany: vi.fn() }
  };
  return { mockPrisma };
});

vi.mock("@/server/db/prisma", () => ({ prisma: mockPrisma }));
vi.mock("./identityService.ts", () => ({ writeRegistry: vi.fn() }));

const mockWriteRegistry = vi.mocked(writeRegistry);

const GROUPS = [{ canonical: "范进", aliases: ["范老爷", "范学道"], type: "PERSON" as const }];

beforeEach(() => {
  vi.clearAllMocks();
  // 事务回调同步执行（tx = mock prisma 单例）
  mockPrisma.$transaction.mockImplementation(async (callback: unknown) => {
    await (callback as (tx: unknown) => Promise<unknown>)(mockPrisma);
  });
  mockWriteRegistry.mockResolvedValue({ created: 0, updated: 0 });
});

describe("runProjection", () => {
  it("空 groups 时直接返回（不写登记表）", async () => {
    const result = await runProjection({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1", groups: [] });

    expect(result).toEqual({ retained: 0, absorbed: 0, repointed: 0, dropped: 0 });
    expect(mockWriteRegistry).not.toHaveBeenCalled();
  });

  it("归并临时实体到 canonical：facts/mentions/aliases 重指向 + 软删被吸收实体", async () => {
    // 保留实体（范进）+ 被吸收实体（范老爷）+ 无实体 alias（范学道）
    mockPrisma.entity.findFirst
      .mockResolvedValueOnce({ id: "ret-1" })   // 保留实体
      .mockResolvedValueOnce({ id: "prov-1" })  // 范老爷
      .mockResolvedValueOnce(null);             // 范学道（无临时实体，仅注册别名）
    mockPrisma.fact.updateMany.mockResolvedValueOnce({ count: 2 }).mockResolvedValueOnce({ count: 1 });
    mockPrisma.mention.updateMany.mockResolvedValueOnce({ count: 3 });
    mockPrisma.alias.updateMany.mockResolvedValueOnce({ count: 1 });
    mockPrisma.entity.update.mockResolvedValueOnce({ id: "prov-1" });

    const result = await runProjection({ bookId: "book-1", jobId: "job-1", agentRunId: "run-1", groups: GROUPS });

    // canonical 实体 + 别名注册走单一写路径
    expect(mockWriteRegistry).toHaveBeenCalledWith({
      bookId    : "book-1",
      source    : "identity",
      agentRunId: "run-1",
      entries   : [{ canonical: "范进", aliases: ["范老爷", "范学道"], type: "PERSON", confidence: 0.85 }]
    });
    // facts 重指向（主语 + 宾语）
    expect(mockPrisma.fact.updateMany).toHaveBeenCalledWith({ where: { sourceEntityId: "prov-1" }, data: { sourceEntityId: "ret-1" } });
    expect(mockPrisma.fact.updateMany).toHaveBeenCalledWith({ where: { targetEntityId: "prov-1" }, data: { targetEntityId: "ret-1" } });
    // mentions 重指向（v6 修复：合并不丢提及统计）
    expect(mockPrisma.mention.updateMany).toHaveBeenCalledWith({ where: { entityId: "prov-1" }, data: { entityId: "ret-1" } });
    // aliases 重指向 + 软删被吸收实体
    expect(mockPrisma.alias.updateMany).toHaveBeenCalledWith({ where: { entityId: "prov-1", bookId: "book-1" }, data: { entityId: "ret-1" } });
    expect(mockPrisma.entity.update).toHaveBeenCalledWith({ where: { id: "prov-1" }, data: { deletedAt: expect.any(Date) } });
    // 关系物化表交由紧随的 Pass3 重建，本 Pass 不重复刷新
    expect(result).toEqual({ retained: 1, absorbed: 1, repointed: 6, dropped: 0 });
  });

  it("dropped 一次性称呼实体：软删实体 + mentions/facts（不再仅降级置信）", async () => {
    // 仅 dropped（无 groups）
    mockPrisma.entity.findFirst.mockResolvedValue({ id: "drop-1" });
    mockPrisma.mention.updateMany.mockResolvedValue({ count: 2 });
    mockPrisma.fact.updateMany.mockResolvedValue({ count: 1 });

    const result = await runProjection({
      bookId    : "book-1",
      jobId     : "job-1",
      agentRunId: "run-1",
      groups    : [],
      dropped   : ["轿夫", "季苇萧的新娘"]
    });

    expect(mockWriteRegistry).not.toHaveBeenCalled();
    expect(mockPrisma.mention.updateMany).toHaveBeenCalledWith({ where: { entityId: "drop-1" }, data: { deletedAt: expect.any(Date) } });
    expect(mockPrisma.fact.updateMany).toHaveBeenCalledWith({ where: { sourceEntityId: "drop-1" }, data: { deletedAt: expect.any(Date) } });
    expect(mockPrisma.entity.update).toHaveBeenCalledWith({ where: { id: "drop-1" }, data: { deletedAt: expect.any(Date) } });
    expect(result).toEqual({ retained: 0, absorbed: 0, repointed: 6, dropped: 2 });
  });
});
