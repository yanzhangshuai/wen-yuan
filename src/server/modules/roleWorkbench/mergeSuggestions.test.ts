/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { describe, expect, it, vi } from "vitest";

import {
  createMergeSuggestionsService,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
} from "@/server/modules/roleWorkbench/mergeSuggestions";
import { mergeEntitiesInTransaction } from "@/server/modules/review/mergeEntities";

// 屏蔽实体合并事务（其内部逻辑由 mergeEntities.test.ts 单独覆盖）。
vi.mock("@/server/modules/review/mergeEntities", () => ({
  mergeEntitiesInTransaction: vi.fn()
}));
const mockMergeEntities = vi.mocked(mergeEntitiesInTransaction);

function createSuggestionRow(overrides: Partial<{
  id            : string;
  status        : string;
  resolvedAt    : Date | null;
  sourceEntityId: string;
  targetEntityId: string;
}> = {}) {
  return {
    id            : "f8d2f35e-0fdf-4ef8-848b-77a06c4c1a7b",
    bookId        : "21676f74-3dca-460d-a50c-8f5485704f6d",
    sourceEntityId: "5eaa808b-0f86-4d79-bb18-991639ca5ca8",
    targetEntityId: "9ef7ad4c-6800-4d99-a0c8-ff3fd5f4c111",
    reason        : "名称相似且上下文一致",
    confidence    : 0.92,
    evidenceRefs  : [{ chapterId: "c-1", paraIndex: 3 }],
    status        : "PENDING",
    createdAt     : new Date("2026-03-25T08:00:00.000Z"),
    resolvedAt    : null,
    book          : { title: "儒林外史" },
    source        : { name: "周进" },
    target        : { name: "周学道" },
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
      where  : expect.objectContaining({ status: "PENDING" }),
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
          source: {
            id       : "source",
            name     : "周进",
            aliases  : [],
            deletedAt: new Date("2026-03-24T00:00:00.000Z")
          },
          target: {
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
    const personaFindMany = vi.fn().mockResolvedValue([
      { id: "source-persona", name: "周进", aliases: ["周公"] },
      { id: "target-persona", name: "周学道", aliases: ["周大人"] }
    ]);
    const mergeSuggestionUpdate = vi.fn().mockResolvedValue(createSuggestionRow({
      id        : "s-accept",
      status    : "ACCEPTED",
      resolvedAt: new Date("2026-03-25T09:10:00.000Z")
    }));
    const mergeSuggestionFindUnique = vi.fn().mockResolvedValue({
      ...createSuggestionRow({
        id            : "s-accept",
        sourceEntityId: "source-persona",
        targetEntityId: "target-persona"
      }),
      source: {
        id       : "source-persona",
        name     : "周进",
        aliases  : ["周公"],
        deletedAt: null
      },
      target: {
        id       : "target-persona",
        name     : "周学道",
        aliases  : ["周大人"],
        deletedAt: null
      }
    });
    const relationFindMany = vi.fn().mockResolvedValue([
      {
        id                  : "rel-self-loop",
        bookId              : "book-1",
        sourceId            : "source-persona",
        targetId            : "target-persona",
        relationshipTypeCode: "师生",
        recordSource        : "AI"
      },
      {
        id                  : "rel-update",
        bookId              : "book-1",
        sourceId            : "source-persona",
        targetId            : "other-persona",
        relationshipTypeCode: "同僚",
        recordSource        : "AI"
      }
    ]);
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      mergeSuggestion: {
        findUnique: mergeSuggestionFindUnique,
        update    : mergeSuggestionUpdate
      },
      persona: {
        findMany: personaFindMany,
        update  : personaUpdate
      },
      biographyRecord           : { updateMany: biographyUpdateMany },
      mention                   : { updateMany: mentionUpdateMany },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([])
      },
      relationship: {
        findMany: relationFindMany,
        findFirst,
        update  : relationshipUpdate
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
      }
    }));
    const service = createMergeSuggestionsService({ $transaction: transaction } as never);

    const result = await service.acceptMergeSuggestion("s-accept");

    expect(result.status).toBe("ACCEPTED");
    // 合并细节收敛到 mergeEntitiesInTransaction（其内部逻辑单独覆盖），此处断言正确调用。
    expect(mockMergeEntities).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ sourceId: "source-persona", targetId: "target-persona" })
    );
    expect(mergeSuggestionUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "s-accept" },
      data : expect.objectContaining({ status: "ACCEPTED" })
    }));
  });
});
