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
    createdAt      : new Date("2026-03-25T08:00:00.000Z"),
    resolvedAt     : null,
    book           : { title: "儒林外史" },
    sourcePersona  : { name: "周进" },
    targetPersona  : { name: "周学道" },
    ...overrides
  };
}

describe("merge suggestions service", () => {
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
});
