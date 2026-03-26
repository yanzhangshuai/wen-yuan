import { ProcessingStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createDeletePersonaService } from "@/server/modules/personas/deletePersona";

describe("deletePersona service", () => {
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
});
