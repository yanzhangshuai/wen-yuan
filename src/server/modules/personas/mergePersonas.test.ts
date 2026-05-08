/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  createMergePersonasService,
  PersonaMergeInputError,
  PersonaNotFoundError
} from "@/server/modules/personas/mergePersonas";

describe("mergePersonas", () => {
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
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
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

  it("redirects related records and soft deletes source persona in one transaction", async () => {
    const relationFindFirst = vi.fn()
      .mockResolvedValueOnce(null)
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
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-self-loop",
            bookId              : "book-1",
            sourceId            : "source-persona",
            targetId            : "target-persona",
            relationshipTypeCode: "teacher_student",
            recordSource        : RecordSource.AI
          },
          {
            id                  : "rel-update",
            bookId              : "book-1",
            sourceId            : "source-persona",
            targetId            : "third-persona",
            relationshipTypeCode: "friend",
            recordSource        : RecordSource.AI
          },
          {
            id                  : "rel-target-side",
            bookId              : "book-1",
            sourceId            : "fourth-persona",
            targetId            : "source-persona",
            relationshipTypeCode: "mentor",
            recordSource        : RecordSource.MANUAL
          }
        ]),
        findFirst: relationFindFirst,
        update   : relationUpdate
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
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
      redirectedRelationships : 2,
      rejectedRelationships   : 1,
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
      where: { id: "rel-update" },
      data : {
        sourceId: "target-persona",
        targetId: "third-persona"
      }
    }));
    expect(relationUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-target-side" },
      data : {
        sourceId: "fourth-persona",
        targetId: "target-persona"
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

  it("re-canonicalizes symmetric relationships after redirecting endpoints", async () => {
    const relationUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "z-winner", name: "王冕", aliases: [] },
          { id: "m-loser", name: "秦老", aliases: [] }
        ]),
        update: vi.fn().mockResolvedValue({})
      },
      biographyRecord           : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mention                   : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([{ code: "classmate" }])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-symmetric",
            bookId              : "book-1",
            sourceId            : "m-loser",
            targetId            : "a-other",
            relationshipTypeCode: "classmate",
            recordSource        : RecordSource.DRAFT_AI
          }
        ]),
        findFirst: vi.fn().mockResolvedValue(null),
        update   : relationUpdate
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
      }
    }));

    const service = createMergePersonasService({ $transaction: transaction } as never);
    const result = await service.mergePersonas({
      sourceId: "m-loser",
      targetId: "z-winner"
    });

    expect(result.redirectedRelationships).toBe(1);
    expect(relationUpdate).toHaveBeenCalledWith({
      where: { id: "rel-symmetric" },
      data : {
        sourceId: "a-other",
        targetId: "z-winner"
      }
    });
  });

  it("keeps MANUAL relationship when redirected relationship conflicts", async () => {
    const relationUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "source-persona", name: "周进", aliases: [] },
          { id: "target-persona", name: "周学道", aliases: [] }
        ]),
        update: vi.fn().mockResolvedValue({})
      },
      biographyRecord           : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mention                   : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-ai",
            bookId              : "book-1",
            sourceId            : "source-persona",
            targetId            : "other-persona",
            relationshipTypeCode: "teacher_student",
            recordSource        : RecordSource.AI
          }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id          : "rel-manual",
          recordSource: RecordSource.MANUAL
        }),
        update: relationUpdate
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
      }
    }));

    const service = createMergePersonasService({ $transaction: transaction } as never);
    const result = await service.mergePersonas({
      sourceId: "source-persona",
      targetId: "target-persona"
    });

    expect(result).toEqual(expect.objectContaining({
      redirectedRelationships: 0,
      rejectedRelationships  : 1
    }));
    expect(relationUpdate).toHaveBeenCalledWith({
      where: { id: "rel-ai" },
      data : {
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      }
    });
  });

  it("keeps lexicographically smaller id when conflicting sources have same rank", async () => {
    const relationUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "source-persona", name: "周进", aliases: [] },
          { id: "target-persona", name: "周学道", aliases: [] }
        ]),
        update: vi.fn().mockResolvedValue({})
      },
      biographyRecord           : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mention                   : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-z",
            bookId              : "book-1",
            sourceId            : "source-persona",
            targetId            : "other-persona",
            relationshipTypeCode: "friend",
            recordSource        : RecordSource.DRAFT_AI
          }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id          : "rel-a",
          recordSource: RecordSource.DRAFT_AI
        }),
        update: relationUpdate
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
      }
    }));

    const service = createMergePersonasService({ $transaction: transaction } as never);
    const result = await service.mergePersonas({
      sourceId: "source-persona",
      targetId: "target-persona"
    });

    expect(result.redirectedRelationships).toBe(0);
    expect(result.rejectedRelationships).toBe(1);
    expect(relationUpdate).toHaveBeenCalledWith({
      where: { id: "rel-z" },
      data : {
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      }
    });
  });

  it("keeps redirected relationship over conflict when its id is smaller", async () => {
    const relationUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "source-persona", name: "周进", aliases: [] },
          { id: "a-winner", name: "周学道", aliases: [] }
        ]),
        update: vi.fn().mockResolvedValue({})
      },
      biographyRecord           : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mention                   : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      relationshipTypeDefinition: {
        findMany: vi.fn().mockResolvedValue([{ code: "classmate" }])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id                  : "rel-a",
            bookId              : "book-1",
            sourceId            : "source-persona",
            targetId            : "z-other",
            relationshipTypeCode: "classmate",
            recordSource        : RecordSource.DRAFT_AI
          }
        ]),
        findFirst: vi.fn().mockResolvedValue({
          id          : "rel-z",
          recordSource: RecordSource.DRAFT_AI
        }),
        update: relationUpdate
      },
      profile: {
        findMany: vi.fn().mockResolvedValue([]),
        update  : vi.fn().mockResolvedValue({})
      }
    }));

    const service = createMergePersonasService({ $transaction: transaction } as never);
    const result = await service.mergePersonas({
      sourceId: "source-persona",
      targetId: "a-winner"
    });

    expect(result.redirectedRelationships).toBe(1);
    expect(result.rejectedRelationships).toBe(1);
    expect(relationUpdate).toHaveBeenCalledWith({
      where: { id: "rel-z" },
      data : {
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      }
    });
    expect(relationUpdate).toHaveBeenCalledWith({
      where: { id: "rel-a" },
      data : {
        sourceId: "a-winner",
        targetId: "z-other"
      }
    });
  });

  it("redirects source profile to target when target has no same-book profile", async () => {
    const profileUpdate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findMany: vi.fn().mockResolvedValue([
          { id: "source-persona", name: "周进", aliases: [] },
          { id: "target-persona", name: "周学道", aliases: [] }
        ]),
        update: vi.fn().mockResolvedValue({})
      },
      biographyRecord           : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      mention                   : { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      relationshipTypeDefinition: { findMany: vi.fn().mockResolvedValue([]) },
      relationship              : {
        findMany : vi.fn().mockResolvedValue([]),
        findFirst: vi.fn().mockResolvedValue(null),
        update   : vi.fn().mockResolvedValue({})
      },
      profile: {
        findMany: vi.fn()
          .mockResolvedValueOnce([{ id: "prof-1", bookId: "book-1", personaId: "source-persona", localTags: [], ironyIndex: 5, localSummary: null, officialTitle: null, moralTier: null, firstAppearanceChapterId: null, visualConfig: null }])
          .mockResolvedValueOnce([]),
        update: profileUpdate
      }
    }));

    const service = createMergePersonasService({ $transaction: transaction } as never);
    await service.mergePersonas({ sourceId: "source-persona", targetId: "target-persona" });

    expect(profileUpdate).toHaveBeenCalledWith({
      where: { id: "prof-1" },
      data : { personaId: "target-persona" }
    });
  });
});
