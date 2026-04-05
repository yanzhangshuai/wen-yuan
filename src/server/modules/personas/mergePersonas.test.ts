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
  createMergePersonasService,
  PersonaMergeInputError,
  PersonaNotFoundError
} from "@/server/modules/personas/mergePersonas";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("mergePersonas", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws input error when source and target are same", async () => {
    const transaction = vi.fn();
    const service = createMergePersonasService({
      $transaction: transaction
    } as never);

    await expect(service.mergePersonas({
      sourceId: "persona-1",
      targetId: "persona-1"
    })).rejects.toBeInstanceOf(PersonaMergeInputError);
    expect(transaction).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws not found when source persona does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          {
            id     : "target-persona",
            name   : "周学道",
            aliases: []
          }
        ])
      }
    }));
    const service = createMergePersonasService({
      $transaction: transaction
    } as never);

    await expect(service.mergePersonas({
      sourceId: "source-persona",
      targetId: "target-persona"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("redirects related records and soft deletes source persona in one transaction", async () => {
    const relationFindFirst = vi.fn()
      .mockResolvedValueOnce({ id: "rel-existing" })
      .mockResolvedValueOnce(null);
    const relationUpdate = vi.fn().mockResolvedValue({});
    const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const mentionUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const personaUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          {
            id     : "source-persona",
            name   : "周进",
            aliases: ["周公", "周进"]
          },
          {
            id     : "target-persona",
            name   : "周学道",
            aliases: ["周大人"]
          }
        ]),
        update: personaUpdate
      },
      biographyRecord: {
        updateMany: biographyUpdateMany
      },
      mention: {
        updateMany: mentionUpdateMany
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id          : "rel-self-loop",
            chapterId   : "chapter-1",
            sourceId    : "source-persona",
            targetId    : "target-persona",
            type        : "师生",
            recordSource: "AI"
          },
          {
            id          : "rel-dup",
            chapterId   : "chapter-1",
            sourceId    : "source-persona",
            targetId    : "other-persona",
            type        : "同僚",
            recordSource: "AI"
          },
          {
            id          : "rel-update",
            chapterId   : "chapter-2",
            sourceId    : "source-persona",
            targetId    : "third-persona",
            type        : "友好",
            recordSource: "AI"
          }
        ]),
        findFirst: relationFindFirst,
        update   : relationUpdate
      }
    }));

    const service = createMergePersonasService({
      $transaction: transaction
    } as never);

    const result = await service.mergePersonas({
      sourceId: "source-persona",
      targetId: "target-persona"
    });

    expect(result).toEqual(expect.objectContaining({
      sourceId                : "source-persona",
      targetId                : "target-persona",
      redirectedRelationships : 1,
      rejectedRelationships   : 2,
      redirectedBiographyCount: 2,
      redirectedMentionCount  : 3
    }));
    expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "source-persona"
      }),
      data: {
        personaId: "target-persona"
      }
    }));
    expect(mentionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "source-persona"
      }),
      data: {
        personaId: "target-persona"
      }
    }));
    expect(relationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-self-loop" },
      data : expect.objectContaining({
        status: ProcessingStatus.REJECTED
      })
    }));
    expect(relationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-dup" },
      data : expect.objectContaining({
        status: ProcessingStatus.REJECTED
      })
    }));
    expect(relationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-update" },
      data : {
        sourceId: "target-persona",
        targetId: "third-persona"
      }
    }));
    expect(personaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "target-persona" },
      data : expect.objectContaining({
        aliases: ["周大人", "周公", "周进"]
      })
    }));
    expect(personaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "source-persona" },
      data : expect.objectContaining({
        deletedAt: expect.any(Date)
      })
    }));
  });
});
