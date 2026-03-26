import { ProcessingStatus } from "@/generated/prisma/enums";
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
