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

  // 用例语义：空 alias 属于脏输入，服务应静默丢弃而不是落库污染缓存。
  it("registerAlias ignores blank aliases", async () => {
    const {
      prisma,
      aliasMappingFindFirst,
      aliasMappingCreate,
      aliasMappingUpdate
    } = createPrismaMock();

    const service = createAliasRegistryService(prisma);
    await service.registerAlias({
      bookId    : "book-1",
      alias     : "   ",
      aliasType : "TITLE",
      confidence: 0.8
    });

    expect(aliasMappingFindFirst).not.toHaveBeenCalled();
    expect(aliasMappingCreate).not.toHaveBeenCalled();
    expect(aliasMappingUpdate).not.toHaveBeenCalled();
  });

  // 用例语义：缓存已预热时，新建 CONFIRMED 映射需要立刻进入内存缓存供后续章节复用。
  it("registerAlias creates a new confirmed mapping and warms the existing cache", async () => {
    const {
      prisma,
      aliasMappingFindMany,
      aliasMappingFindFirst,
      aliasMappingCreate
    } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([
      createAliasRow({ id: "old", alias: "吴王", personaId: "persona-old", confidence: 0.4 })
    ]);
    aliasMappingFindFirst.mockResolvedValueOnce(null);
    aliasMappingCreate.mockResolvedValueOnce(
      createAliasRow({
        id        : "new",
        alias     : "吴王",
        personaId : "persona-new",
        confidence: 0.91,
        status    : AliasMappingStatus.CONFIRMED
      })
    );

    const service = createAliasRegistryService(prisma);
    await service.loadBookAliasCache("book-1");
    await service.registerAlias({
      bookId      : "book-1",
      personaId   : "persona-new",
      alias       : " 吴王 ",
      resolvedName: "孙权",
      aliasType   : "TITLE",
      confidence  : 0.91,
      chapterStart: 1,
      status      : "CONFIRMED"
    });

    const lookup = await service.lookupAlias("book-1", "吴王", 3);
    expect(lookup?.id).toBe("new");
    expect(lookup?.personaId).toBe("persona-new");
    expect(aliasMappingCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        alias       : "吴王",
        resolvedName: "孙权",
        status      : AliasMappingStatus.CONFIRMED
      })
    });
  });

  // 用例语义：PENDING 映射只能进入待确认列表，不能提前污染运行时 alias 命中缓存。
  it("registerAlias keeps pending mappings out of the warmed cache", async () => {
    const {
      prisma,
      aliasMappingFindMany,
      aliasMappingFindFirst,
      aliasMappingCreate
    } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([]);
    aliasMappingFindFirst.mockResolvedValueOnce(null);
    aliasMappingCreate.mockResolvedValueOnce(
      createAliasRow({
        id        : "pending-1",
        alias     : "老爷",
        personaId : "persona-1",
        confidence: 0.88,
        status    : AliasMappingStatus.PENDING
      })
    );

    const service = createAliasRegistryService(prisma);
    await service.loadBookAliasCache("book-1");
    await service.registerAlias({
      bookId      : "book-1",
      personaId   : "persona-1",
      alias       : "老爷",
      resolvedName: "范进",
      aliasType   : "NICKNAME",
      confidence  : 0.88,
      status      : "PENDING"
    });

    await expect(service.lookupAlias("book-1", "老爷", 2)).resolves.toBeNull();
  });

  // 用例语义：同 persona + 同章节范围的缓存条目应被原位更新，而不是在同一 bucket 中重复堆积。
  it("registerAlias replaces the cached entry when persona and scope already match", async () => {
    const {
      prisma,
      aliasMappingFindMany,
      aliasMappingFindFirst,
      aliasMappingUpdate
    } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([
      createAliasRow({
        id          : "existing",
        alias       : "丞相",
        personaId   : "persona-1",
        confidence  : 0.4,
        chapterStart: 1,
        chapterEnd  : 5
      }),
      createAliasRow({
        id          : "other-scope",
        alias       : "丞相",
        personaId   : "persona-2",
        confidence  : 0.8,
        chapterStart: 6,
        chapterEnd  : 9
      })
    ]);
    aliasMappingFindFirst.mockResolvedValueOnce(
      createAliasRow({
        id          : "existing",
        alias       : "丞相",
        personaId   : "persona-1",
        confidence  : 0.4,
        chapterStart: 1,
        chapterEnd  : 5
      })
    );
    aliasMappingUpdate.mockResolvedValueOnce(
      createAliasRow({
        id          : "existing",
        alias       : "丞相",
        personaId   : "persona-1",
        confidence  : 0.93,
        chapterStart: 1,
        chapterEnd  : 5,
        status      : AliasMappingStatus.CONFIRMED
      })
    );

    const service = createAliasRegistryService(prisma);
    await service.loadBookAliasCache("book-1");
    await service.registerAlias({
      bookId      : "book-1",
      personaId   : "persona-1",
      alias       : "丞相",
      resolvedName: "诸葛亮",
      aliasType   : "POSITION",
      confidence  : 0.93,
      chapterStart: 1,
      chapterEnd  : 5,
      status      : "CONFIRMED"
    });

    const earlyChapter = await service.lookupAlias("book-1", "丞相", 3);
    const lateChapter = await service.lookupAlias("book-1", "丞相", 7);

    expect(earlyChapter?.id).toBe("existing");
    expect(earlyChapter?.confidence).toBe(0.93);
    expect(lateChapter?.id).toBe("other-scope");
  });

  // 用例语义：别名映射列表既要支持 PENDING 快捷入口，也要支持不传 status 的全量浏览。
  it("lists pending mappings and alias mappings with optional status filters", async () => {
    const { prisma, aliasMappingFindMany } = createPrismaMock();
    aliasMappingFindMany
      .mockResolvedValueOnce([
        createAliasRow({ id: "pending", status: AliasMappingStatus.PENDING })
      ])
      .mockResolvedValueOnce([
        createAliasRow({ id: "confirmed", status: AliasMappingStatus.CONFIRMED }),
        createAliasRow({ id: "pending", status: AliasMappingStatus.PENDING })
      ]);

    const service = createAliasRegistryService(prisma);
    const pending = await service.listPendingMappings("book-1");
    const mappings = await service.listAliasMappings("book-1");

    expect(pending.map((item) => item.id)).toEqual(["pending"]);
    expect(mappings.map((item) => item.id)).toEqual(["confirmed", "pending"]);
    expect(aliasMappingFindMany).toHaveBeenNthCalledWith(1, {
      where  : { bookId: "book-1", status: AliasMappingStatus.PENDING },
      orderBy: { confidence: "desc" }
    });
    expect(aliasMappingFindMany).toHaveBeenNthCalledWith(2, {
      where  : { bookId: "book-1" },
      orderBy: { confidence: "desc" }
    });
  });

  // 用例语义：跨书或失效记录不应被误更新，服务应返回 null 而不是抛错。
  it("updateMappingStatus returns null when the mapping does not exist", async () => {
    const { prisma, aliasMappingFindFirst, aliasMappingUpdate } = createPrismaMock();
    aliasMappingFindFirst.mockResolvedValueOnce(null);

    const service = createAliasRegistryService(prisma);
    await expect(service.updateMappingStatus("missing", "book-1", "CONFIRMED")).resolves.toBeNull();
    expect(aliasMappingUpdate).not.toHaveBeenCalled();
  });

  // 用例语义：被拒绝的映射必须从缓存中移除；如果该 alias bucket 只剩这一条，还要整桶删除。
  it("updateMappingStatus removes rejected mappings from the warmed cache", async () => {
    const {
      prisma,
      aliasMappingFindMany,
      aliasMappingFindFirst,
      aliasMappingUpdate
    } = createPrismaMock();
    const cachedRow = createAliasRow({
      id       : "mapping-1",
      alias    : "吴王",
      personaId: "persona-1"
    });
    aliasMappingFindMany.mockResolvedValueOnce([cachedRow]);
    aliasMappingFindFirst.mockResolvedValueOnce(cachedRow);
    aliasMappingUpdate.mockResolvedValueOnce({
      ...cachedRow,
      status: AliasMappingStatus.REJECTED
    });

    const service = createAliasRegistryService(prisma);
    await service.loadBookAliasCache("book-1");
    await service.updateMappingStatus("mapping-1", "book-1", "REJECTED");

    await expect(service.lookupAlias("book-1", "吴王", 1)).resolves.toBeNull();
  });

  // 用例语义：人工确认或模型复核后的有效映射应回写缓存，避免确认结果要等下次预热才生效。
  it("updateMappingStatus writes inferred mappings back into the warmed cache", async () => {
    const {
      prisma,
      aliasMappingFindMany,
      aliasMappingFindFirst,
      aliasMappingUpdate
    } = createPrismaMock();
    aliasMappingFindMany.mockResolvedValueOnce([]);
    aliasMappingFindFirst.mockResolvedValueOnce(
      createAliasRow({
        id       : "mapping-2",
        alias    : "太祖皇帝",
        personaId: "persona-2",
        status   : AliasMappingStatus.PENDING
      })
    );
    aliasMappingUpdate.mockResolvedValueOnce(
      createAliasRow({
        id        : "mapping-2",
        alias     : "太祖皇帝",
        personaId : "persona-2",
        confidence: 0.89,
        status    : AliasMappingStatus.LLM_INFERRED
      })
    );

    const service = createAliasRegistryService(prisma);
    await service.loadBookAliasCache("book-1");
    const updated = await service.updateMappingStatus("mapping-2", "book-1", "LLM_INFERRED");
    const lookup = await service.lookupAlias("book-1", "太祖皇帝", 6);

    expect(updated?.status).toBe("LLM_INFERRED");
    expect(lookup?.id).toBe("mapping-2");
    expect(lookup?.confidence).toBe(0.89);
  });
});
