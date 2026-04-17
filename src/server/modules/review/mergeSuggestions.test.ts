/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { ProcessingStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  createMergeSuggestionsService,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
} from "@/server/modules/review/mergeSuggestions";

function createSuggestionRow(overrides: Partial<{
  id             : string;
  status         : string;
  resolvedAt     : Date | null;
  sourcePersonaId: string;
  targetPersonaId: string;
}> = {}) {
  return {
    id             : "f8d2f35e-0fdf-4ef8-848b-77a06c4c1a7b",
    bookId         : "21676f74-3dca-460d-a50c-8f5485704f6d",
    sourcePersonaId: "5eaa808b-0f86-4d79-bb18-991639ca5ca8",
    targetPersonaId: "9ef7ad4c-6800-4d99-a0c8-ff3fd5f4c111",
    reason         : "名称相似且上下文一致",
    confidence     : 0.92,
    evidenceRefs   : [{ chapterId: "c-1", paraIndex: 3 }],
    status         : "PENDING",
    source         : "STAGE_B_AUTO",
    createdAt      : new Date("2026-03-25T08:00:00.000Z"),
    resolvedAt     : null,
    book           : { title: "儒林外史" },
    sourcePersona  : { name: "周进" },
    targetPersona  : { name: "周学道" },
    ...overrides
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("merge suggestions service", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lists merge suggestions with mapped fields", async () => {
    const findMany = vi.fn().mockResolvedValue([createSuggestionRow()]);
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findMany }
    } as never);

    const result = await service.listMergeSuggestions({ status: "PENDING" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where  : { status: "PENDING" },
      orderBy: [{ createdAt: "desc" }]
    }));
    expect(result).toEqual([
      expect.objectContaining({
        id        : "f8d2f35e-0fdf-4ef8-848b-77a06c4c1a7b",
        bookTitle : "儒林外史",
        sourceName: "周进",
        targetName: "周学道",
        status    : "PENDING",
        createdAt : "2026-03-25T08:00:00.000Z",
        resolvedAt: null
      })
    ]);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects suggestion and marks resolved time", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id    : "s-1",
      status: "PENDING"
    });
    const update = vi.fn().mockResolvedValue(createSuggestionRow({
      id        : "s-1",
      status    : "REJECTED",
      resolvedAt: new Date("2026-03-25T09:00:00.000Z")
    }));
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mergeSuggestion: {
        findUnique,
        update
      }
    }));
    const service = createMergeSuggestionsService({
      $transaction: transaction
    } as never);

    const result = await service.rejectMergeSuggestion("s-1");

    expect(result.status).toBe("REJECTED");
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s-1" },
      data : expect.objectContaining({
        status: "REJECTED"
      })
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws state error when rejecting non-pending suggestion", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mergeSuggestion: {
        findUnique: vi.fn().mockResolvedValue({
          id    : "s-1",
          status: "ACCEPTED"
        }),
        update: vi.fn()
      }
    }));
    const service = createMergeSuggestionsService({
      $transaction: transaction
    } as never);

    await expect(service.rejectMergeSuggestion("s-1")).rejects.toBeInstanceOf(MergeSuggestionStateError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws not found when accepting missing suggestion", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mergeSuggestion: {
        findUnique: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createMergeSuggestionsService({
      $transaction: transaction
    } as never);

    await expect(service.acceptMergeSuggestion("missing-id")).rejects.toBeInstanceOf(MergeSuggestionNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws conflict when source or target persona has been deleted", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mergeSuggestion: {
        findUnique: vi.fn().mockResolvedValue({
          ...createSuggestionRow(),
          sourcePersona: {
            id       : "source",
            name     : "周进",
            aliases  : [],
            deletedAt: new Date("2026-03-24T00:00:00.000Z")
          },
          targetPersona: {
            id       : "target",
            name     : "周学道",
            aliases  : [],
            deletedAt: null
          }
        })
      }
    }));
    const service = createMergeSuggestionsService({
      $transaction: transaction
    } as never);

    await expect(service.acceptMergeSuggestion("s-1")).rejects.toBeInstanceOf(PersonaMergeConflictError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("accepts suggestion and redirects records in one transaction", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const relationshipUpdate = vi.fn().mockResolvedValue({});
    const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const mentionUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const personaUpdate = vi.fn().mockResolvedValue({});
    const mergeSuggestionUpdate = vi.fn().mockResolvedValue(createSuggestionRow({
      id        : "s-accept",
      status    : "ACCEPTED",
      resolvedAt: new Date("2026-03-25T09:10:00.000Z")
    }));
    const mergeSuggestionFindUnique = vi.fn().mockResolvedValue({
      ...createSuggestionRow({
        id             : "s-accept",
        sourcePersonaId: "source-persona",
        targetPersonaId: "target-persona"
      }),
      sourcePersona: {
        id       : "source-persona",
        name     : "周进",
        aliases  : ["周公"],
        deletedAt: null
      },
      targetPersona: {
        id       : "target-persona",
        name     : "周学道",
        aliases  : ["周大人"],
        deletedAt: null
      }
    });
    const relationFindMany = vi.fn().mockResolvedValue([
      {
        id          : "rel-self-loop",
        chapterId   : "chapter-1",
        sourceId    : "source-persona",
        targetId    : "target-persona",
        type        : "师生",
        recordSource: "AI"
      },
      {
        id          : "rel-update",
        chapterId   : "chapter-2",
        sourceId    : "source-persona",
        targetId    : "other-persona",
        type        : "同僚",
        recordSource: "AI"
      }
    ]);
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mergeSuggestion: {
        findUnique: mergeSuggestionFindUnique,
        update    : mergeSuggestionUpdate
      },
      biographyRecord: {
        updateMany: biographyUpdateMany
      },
      mention: {
        updateMany: mentionUpdateMany
      },
      relationship: {
        findMany: relationFindMany,
        findFirst,
        update  : relationshipUpdate
      },
      persona: {
        update: personaUpdate
      }
    }));
    const service = createMergeSuggestionsService({
      $transaction: transaction
    } as never);

    const result = await service.acceptMergeSuggestion("s-accept");

    expect(result.status).toBe("ACCEPTED");
    expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { personaId: "target-persona" }
    }));
    expect(mentionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: { personaId: "target-persona" }
    }));
    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-self-loop" },
      data : expect.objectContaining({
        status: ProcessingStatus.REJECTED
      })
    }));
    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-update" },
      data : {
        sourceId: "target-persona",
        targetId: "other-persona"
      }
    }));
    expect(personaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "target-persona" },
      data : expect.objectContaining({
        aliases: ["周大人", "周公", "周进"]
      })
    }));
    expect(mergeSuggestionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s-accept" },
      data : expect.objectContaining({
        status: "ACCEPTED"
      })
    }));
  });

  // ── 审核中心扩展服务（listBookSuggestionsByTab / acceptSuggestionForReviewCenter） ──

  it("listBookSuggestionsByTab · tab=merge 过滤 PENDING + source in (STAGE_B_AUTO, STAGE_C_FEEDBACK)", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createSuggestionRow({ id: "s-merge-1" }),
      createSuggestionRow({ id: "s-merge-2" })
    ]);
    const count = vi.fn().mockResolvedValue(2);
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findMany, count }
    } as never);

    const result = await service.listBookSuggestionsByTab({
      bookId  : "book-1",
      tab     : "merge",
      page    : 1,
      pageSize: 20
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        bookId: "book-1",
        status: "PENDING",
        source: { in: ["STAGE_B_AUTO", "STAGE_C_FEEDBACK"] }
      },
      skip: 0,
      take: 20
    }));
    expect(count).toHaveBeenCalledWith({
      where: {
        bookId: "book-1",
        status: "PENDING",
        source: { in: ["STAGE_B_AUTO", "STAGE_C_FEEDBACK"] }
      }
    });
    expect(result.total).toBe(2);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.source).toBe("STAGE_B_AUTO");
  });

  it("listBookSuggestionsByTab · tab=impersonation 过滤 source=STAGE_B5_TEMPORAL + PENDING", async () => {
    const findMany = vi.fn().mockResolvedValue([
      createSuggestionRow({ id: "s-b5", source: "STAGE_B5_TEMPORAL" } as never)
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findMany, count }
    } as never);

    const result = await service.listBookSuggestionsByTab({
      bookId  : "book-1",
      tab     : "impersonation",
      page    : 2,
      pageSize: 10
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        bookId: "book-1",
        status: "PENDING",
        source: "STAGE_B5_TEMPORAL"
      },
      skip: 10,
      take: 10
    }));
    expect(result.items[0]?.source).toBe("STAGE_B5_TEMPORAL");
  });

  it("listBookSuggestionsByTab · tab=done 过滤 status in (ACCEPTED, REJECTED)，忽略 source", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findMany, count }
    } as never);

    await service.listBookSuggestionsByTab({
      bookId  : "book-1",
      tab     : "done",
      page    : 1,
      pageSize: 20
    });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        bookId: "book-1",
        status: { in: ["ACCEPTED", "REJECTED"] }
      }
    }));
    const whereArg = findMany.mock.calls[0]?.[0] as { where: Record<string, unknown> };
    expect(whereArg.where.source).toBeUndefined();
  });

  it("acceptSuggestionForReviewCenter · STAGE_B5_TEMPORAL 只改状态，不走合并事务", async () => {
    const findUniqueOuter = vi.fn().mockResolvedValue({
      id    : "s-b5",
      bookId: "book-1",
      source: "STAGE_B5_TEMPORAL",
      status: "PENDING"
    });
    const txFindUnique = vi.fn().mockResolvedValue({ id: "s-b5", status: "PENDING" });
    const txUpdate = vi.fn().mockResolvedValue(createSuggestionRow({
      id        : "s-b5", status    : "ACCEPTED", resolvedAt: new Date("2026-04-01T00:00:00.000Z"),
      source    : "STAGE_B5_TEMPORAL"
    } as never));
    // 冒名分支不应调用 biographyRecord.updateMany / mention.updateMany。
    const biographyUpdateMany = vi.fn();
    const mentionUpdateMany = vi.fn();

    const tx = {
      mergeSuggestion: { findUnique: txFindUnique, update: txUpdate },
      biographyRecord: { updateMany: biographyUpdateMany },
      mention        : { updateMany: mentionUpdateMany },
      relationship   : { findMany: vi.fn(), update: vi.fn() },
      persona        : { update: vi.fn() }
    };
    const $transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));

    const service = createMergeSuggestionsService({
      mergeSuggestion: { findUnique: findUniqueOuter },
      $transaction
    } as never);

    const result = await service.acceptSuggestionForReviewCenter("book-1", "s-b5");

    expect(result.status).toBe("ACCEPTED");
    expect(biographyUpdateMany).not.toHaveBeenCalled();
    expect(mentionUpdateMany).not.toHaveBeenCalled();
    expect(txUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s-b5" },
      data : expect.objectContaining({ status: "ACCEPTED" })
    }));
  });

  it("acceptSuggestionForReviewCenter · 非冒名来源走全量合并事务", async () => {
    const findUniqueOuter = vi.fn().mockResolvedValue({
      id    : "s-merge",
      bookId: "book-1",
      source: "STAGE_B_AUTO",
      status: "PENDING"
    });

    // 事务内同时满足 accept 合并分支（biography/mention/relationship/persona）。
    const txFindUnique = vi.fn().mockResolvedValue({
      id             : "s-merge",
      bookId         : "book-1",
      sourcePersonaId: "src-p",
      targetPersonaId: "tgt-p",
      reason         : "r",
      confidence     : 0.9,
      evidenceRefs   : {},
      status         : "PENDING",
      source         : "STAGE_B_AUTO",
      createdAt      : new Date(),
      resolvedAt     : null,
      book           : { title: "t" },
      sourcePersona  : { id: "src-p", name: "A", aliases: [], deletedAt: null },
      targetPersona  : { id: "tgt-p", name: "B", aliases: [], deletedAt: null }
    });
    const biographyUpdateMany = vi.fn();
    const mentionUpdateMany = vi.fn();
    const relationFindMany = vi.fn().mockResolvedValue([]);
    const personaUpdate = vi.fn();
    const txUpdate = vi.fn().mockResolvedValue(createSuggestionRow({
      id: "s-merge", status: "ACCEPTED", resolvedAt: new Date()
    } as never));

    const tx = {
      mergeSuggestion: { findUnique: txFindUnique, update: txUpdate },
      biographyRecord: { updateMany: biographyUpdateMany },
      mention        : { updateMany: mentionUpdateMany },
      relationship   : { findMany: relationFindMany, update: vi.fn() },
      persona        : { update: personaUpdate }
    };
    const $transaction = vi.fn().mockImplementation(async (fn: (tx: unknown) => Promise<unknown>) => fn(tx));
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findUnique: findUniqueOuter },
      $transaction
    } as never);

    const result = await service.acceptSuggestionForReviewCenter("book-1", "s-merge");

    expect(result.status).toBe("ACCEPTED");
    // 全量合并事务必须迁移传记/提及。
    expect(biographyUpdateMany).toHaveBeenCalled();
    expect(mentionUpdateMany).toHaveBeenCalled();
  });

  it("acceptSuggestionForReviewCenter · bookId 不匹配时抛 NotFound（防越权）", async () => {
    const findUniqueOuter = vi.fn().mockResolvedValue({
      id    : "s-x",
      bookId: "other-book",
      source: "STAGE_B_AUTO",
      status: "PENDING"
    });
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findUnique: findUniqueOuter },
      $transaction   : vi.fn()
    } as never);

    await expect(
      service.acceptSuggestionForReviewCenter("book-1", "s-x")
    ).rejects.toBeInstanceOf(MergeSuggestionNotFoundError);
  });

  it("rejectSuggestionForReviewCenter · bookId 不匹配抛 NotFound", async () => {
    const findUniqueOuter = vi.fn().mockResolvedValue({
      id    : "s-x",
      bookId: "other-book"
    });
    const service = createMergeSuggestionsService({
      mergeSuggestion: { findUnique: findUniqueOuter },
      $transaction   : vi.fn()
    } as never);

    await expect(
      service.rejectSuggestionForReviewCenter("book-1", "s-x")
    ).rejects.toBeInstanceOf(MergeSuggestionNotFoundError);
  });
});
