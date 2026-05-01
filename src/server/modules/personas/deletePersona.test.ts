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

import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createDeletePersonaService } from "@/server/modules/personas/deletePersona";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("deletePersona service", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("soft deletes persona and cascades related records", async () => {
    const personaFindFirst = vi.fn().mockResolvedValue({ id: "persona-1" });
    const relationshipUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const mentionUpdateMany = vi.fn().mockResolvedValue({ count: 4 });
    const profileUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
    const personaUpdate = vi.fn().mockResolvedValue({ id: "persona-1" });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: personaFindFirst,
        update   : personaUpdate
      },
      relationship: {
        updateMany: relationshipUpdateMany
      },
      biographyRecord: {
        updateMany: biographyUpdateMany
      },
      mention: {
        updateMany: mentionUpdateMany
      },
      profile: {
        updateMany: profileUpdateMany
      }
    }));
    const service = createDeletePersonaService({
      $transaction: transaction
    } as never);

    const result = await service.deletePersona("persona-1");

    expect(personaFindFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id       : "persona-1",
        deletedAt: null
      })
    }));
    expect(relationshipUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: [{ sourceId: "persona-1" }, { targetId: "persona-1" }]
      }),
      data: expect.objectContaining({
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      })
    }));
    expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "persona-1"
      }),
      data: expect.objectContaining({
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      })
    }));
    expect(mentionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "persona-1"
      }),
      data: expect.objectContaining({
        deletedAt: expect.any(Date)
      })
    }));
    expect(profileUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "persona-1"
      }),
      data: expect.objectContaining({
        deletedAt: expect.any(Date)
      })
    }));
    expect(personaUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "persona-1" },
      data : expect.objectContaining({
        deletedAt: expect.any(Date)
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id      : "persona-1",
      cascaded: {
        relationshipCount: 2,
        biographyCount   : 3,
        mentionCount     : 4,
        profileCount     : 1
      }
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws not found when persona does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createDeletePersonaService({
      $transaction: transaction
    } as never);

    await expect(service.deletePersona("missing"))
      .rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("previews cascade details using the same current-book filters as deletion", async () => {
    const service = createDeletePersonaService({
      persona: {
        findFirst: vi.fn().mockResolvedValue({ id: "persona-1", name: "范进" })
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-1",
            relationshipTypeCode: "师生",
            source              : { name: "周进" },
            target              : { name: "范进" },
            events              : [
              {
                summary: "周进提携范进",
                chapter: { no: 3, title: "范进中举" }
              }
            ]
          }
        ])
      },
      biographyRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id       : "bio-1",
            title    : "中举",
            event    : "范进中举",
            chapterNo: 3,
            chapter  : { title: "范进中举" }
          }
        ])
      },
      mention: {
        findMany: vi.fn().mockResolvedValue([
          {
            id     : "mention-1",
            rawText: "范进",
            summary: "出场",
            chapter: { no: 3, title: "范进中举" }
          }
        ])
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([{ id: "profile-1", localName: "范进", bookId: "book-1" }])
      }
    } as never);

    const preview = await service.previewDeletePersona("persona-1", { bookId: "book-1" });

    expect(preview.counts).toEqual({
      relationshipCount: 1,
      biographyCount   : 1,
      mentionCount     : 1,
      profileCount     : 1
    });
    expect(preview.biographies[0]).toEqual(expect.objectContaining({
      id     : "bio-1",
      chapter: "第3回 范进中举"
    }));
    expect(preview.relationships[0]).toEqual(expect.objectContaining({
      sourceName: "周进",
      targetName: "范进"
    }));
  });
});
