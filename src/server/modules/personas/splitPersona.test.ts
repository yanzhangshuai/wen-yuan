/**
 * 文件定位（服务模块单测）：
 * - 覆盖人物拆分服务的输入校验、事务迁移与关系冲突处理。
 */

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  createSplitPersonaService,
  PersonaSplitInputError,
  PersonaNotFoundError
} from "@/server/modules/personas/splitPersona";

describe("splitPersona", () => {
  it("throws input error when chapter list is empty", async () => {
    const transaction = vi.fn();
    const service = createSplitPersonaService({
      $transaction: transaction
    } as never);

    await expect(service.splitPersona({
      sourceId  : "persona-1",
      bookId    : "book-1",
      chapterNos: [],
      name      : "新人物"
    })).rejects.toBeInstanceOf(PersonaSplitInputError);
    expect(transaction).not.toHaveBeenCalled();
  });

  it("throws not found when source persona does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createSplitPersonaService({
      $transaction: transaction
    } as never);

    await expect(service.splitPersona({
      sourceId  : "missing-persona",
      bookId    : "book-1",
      chapterNos: [1],
      name      : "新人物"
    })).rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("throws input error when chapters are not in current book", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue({
          id        : "source-persona",
          type      : "PERSON",
          nameType  : "NAMED",
          gender    : null,
          hometown  : null,
          globalTags: [],
          confidence: 0.7
        })
      },
      chapter: {
        findMany: vi.fn().mockResolvedValue([{ id: "chapter-1", no: 1 }])
      }
    }));
    const service = createSplitPersonaService({
      $transaction: transaction
    } as never);

    await expect(service.splitPersona({
      sourceId  : "source-persona",
      bookId    : "book-1",
      chapterNos: [1, 2],
      name      : "新人物"
    })).rejects.toBeInstanceOf(PersonaSplitInputError);
  });

  it("creates new persona and redirects chapter-scoped records with relation conflict handling", async () => {
    const relationshipFindFirst = vi.fn()
      .mockResolvedValueOnce({ id: "rel-existing" })
      .mockResolvedValueOnce(null);
    const relationshipUpdate = vi.fn().mockResolvedValue({});
    const biographyUpdateMany = vi.fn().mockResolvedValue({ count: 2 });
    const mentionUpdateMany = vi.fn().mockResolvedValue({ count: 3 });
    const personaCreate = vi.fn().mockResolvedValue({ id: "created-persona" });
    const profileCreate = vi.fn().mockResolvedValue({});

    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue({
          id        : "source-persona",
          type      : "PERSON",
          nameType  : "NAMED",
          gender    : "男",
          hometown  : "杭州",
          globalTags: ["举人"],
          confidence: 0.64
        }),
        create: personaCreate
      },
      chapter: {
        findMany: vi.fn().mockResolvedValue([
          { id: "chapter-1", no: 1 },
          { id: "chapter-2", no: 2 }
        ])
      },
      profile: {
        create: profileCreate
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
            targetId    : "source-persona",
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
        findFirst: relationshipFindFirst,
        update   : relationshipUpdate
      }
    }));
    const service = createSplitPersonaService({
      $transaction: transaction
    } as never);

    const result = await service.splitPersona({
      sourceId  : "source-persona",
      bookId    : "book-1",
      chapterNos: [1, 2],
      name      : "马二先生",
      aliases   : ["马二", " 马二先生 "]
    });

    expect(result).toEqual({
      sourceId                : "source-persona",
      createdPersonaId        : "created-persona",
      bookId                  : "book-1",
      chapterNos              : [1, 2],
      redirectedRelationships : 1,
      rejectedRelationships   : 2,
      redirectedBiographyCount: 2,
      redirectedMentionCount  : 3
    });
    expect(personaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name        : "马二先生",
        aliases     : ["马二先生", "马二"],
        recordSource: RecordSource.MANUAL
      })
    }));
    expect(profileCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        personaId: "created-persona",
        bookId   : "book-1",
        localName: "马二先生"
      })
    }));
    expect(biographyUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "source-persona"
      }),
      data: { personaId: "created-persona" }
    }));
    expect(mentionUpdateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        personaId: "source-persona"
      }),
      data: { personaId: "created-persona" }
    }));
    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-self-loop" },
      data : expect.objectContaining({
        status: ProcessingStatus.REJECTED
      })
    }));
    expect(relationshipUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "rel-dup" },
      data : expect.objectContaining({
        status: ProcessingStatus.REJECTED
      })
    }));
    expect(relationshipUpdate).toHaveBeenCalledWith({
      where: { id: "rel-update" },
      data : {
        sourceId: "created-persona",
        targetId: "third-persona"
      }
    });
  });
});
