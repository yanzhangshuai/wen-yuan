/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { AliasMappingStatus, AliasType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAliasRegistryService } from "@/server/modules/analysis/services/AliasRegistryService";

function createAliasRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id          : "mapping-1",
    bookId      : "book-1",
    personaId   : "persona-1",
    alias       : "丞相",
    resolvedName: "张三",
    aliasType   : AliasType.POSITION,
    confidence  : 0.8,
    evidence    : "上下文提及内阁",
    status      : AliasMappingStatus.CONFIRMED,
    chapterStart: 1,
    chapterEnd  : 10,
    contextHash : null,
    createdAt   : new Date("2026-03-31T00:00:00.000Z"),
    updatedAt   : new Date("2026-03-31T00:00:00.000Z"),
    ...overrides
  };
}

function createPrismaMock() {
  const aliasMappingFindMany = vi.fn();
  const aliasMappingFindFirst = vi.fn();
  const aliasMappingCreate = vi.fn();
  const aliasMappingUpdate = vi.fn();

  return {
    prisma: {
      aliasMapping: {
        findMany : aliasMappingFindMany,
        findFirst: aliasMappingFindFirst,
        create   : aliasMappingCreate,
        update   : aliasMappingUpdate
      }
    } as never,
    aliasMappingFindMany,
    aliasMappingFindFirst,
    aliasMappingCreate,
    aliasMappingUpdate
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("AliasRegistryService", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lookupAlias returns highest-confidence mapping in chapter scope", async () => {
    const { prisma, aliasMappingFindMany } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([
      createAliasRow({ id: "low", confidence: 0.7, chapterStart: 1, chapterEnd: 12 }),
      createAliasRow({ id: "high", confidence: 0.92, chapterStart: 5, chapterEnd: 9 }),
      createAliasRow({ id: "future", confidence: 0.99, chapterStart: 20, chapterEnd: null })
    ]);

    const service = createAliasRegistryService(prisma);
    const result = await service.lookupAlias("book-1", "丞相", 8);

    expect(result?.id).toBe("high");
    expect(result?.confidence).toBe(0.92);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lookupAlias respects chapter scope and returns null when no match", async () => {
    const { prisma, aliasMappingFindMany } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([
      createAliasRow({ id: "expired", chapterStart: 1, chapterEnd: 3 }),
      createAliasRow({ id: "future", chapterStart: 10, chapterEnd: 20 })
    ]);

    const service = createAliasRegistryService(prisma);
    const result = await service.lookupAlias("book-1", "丞相", 6);

    expect(result).toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("registerAlias skips write when existing confidence is higher", async () => {
    const { prisma, aliasMappingFindFirst, aliasMappingCreate, aliasMappingUpdate } = createPrismaMock();
    aliasMappingFindFirst.mockResolvedValueOnce(createAliasRow({ confidence: 0.95 }));

    const service = createAliasRegistryService(prisma);
    await service.registerAlias({
      bookId      : "book-1",
      alias       : "丞相",
      aliasType   : "POSITION",
      confidence  : 0.7,
      chapterStart: 1
    });

    expect(aliasMappingCreate).not.toHaveBeenCalled();
    expect(aliasMappingUpdate).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("registerAlias updates existing mapping when confidence is higher", async () => {
    const { prisma, aliasMappingFindFirst, aliasMappingUpdate } = createPrismaMock();
    aliasMappingFindFirst.mockResolvedValueOnce(createAliasRow({ id: "existing", confidence: 0.5 }));
    aliasMappingUpdate.mockResolvedValueOnce(createAliasRow({ id: "existing", confidence: 0.88 }));

    const service = createAliasRegistryService(prisma);
    await service.registerAlias({
      bookId      : "book-1",
      alias       : "丞相",
      aliasType   : "POSITION",
      confidence  : 0.88,
      chapterStart: 1,
      evidence    : "同段落出现张三",
      resolvedName: "张三"
    });

    expect(aliasMappingUpdate).toHaveBeenCalledWith({
      where: { id: "existing" },
      data : expect.objectContaining({
        confidence: 0.88,
        aliasType : AliasType.POSITION
      })
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("loadBookAliasCache groups by alias and sorts by confidence", async () => {
    const { prisma, aliasMappingFindMany } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([
      createAliasRow({ id: "a1", alias: "吴王", confidence: 0.6 }),
      createAliasRow({ id: "a2", alias: "吴王", confidence: 0.9 }),
      createAliasRow({ id: "b1", alias: "太祖皇帝", confidence: 0.8 })
    ]);

    const service = createAliasRegistryService(prisma);
    const cache = await service.loadBookAliasCache("book-1");

    expect(cache.get("吴王")?.map((item) => item.id)).toEqual(["a2", "a1"]);
    expect(cache.get("太祖皇帝")?.[0]?.id).toBe("b1");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("persists and reads LLM_INFERRED without degrading to PENDING", async () => {
    const { prisma, aliasMappingFindFirst, aliasMappingCreate } = createPrismaMock();
    aliasMappingFindFirst.mockResolvedValueOnce(null);
    aliasMappingCreate.mockResolvedValueOnce(
      createAliasRow({ id: "llm-1", status: AliasMappingStatus.LLM_INFERRED })
    );

    const service = createAliasRegistryService(prisma);
    await service.registerAlias({
      bookId    : "book-1",
      alias     : "老爷",
      aliasType : "NICKNAME",
      confidence: 0.83,
      status    : "LLM_INFERRED"
    });

    expect(aliasMappingCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: AliasMappingStatus.LLM_INFERRED
      })
    }));
  });
});
