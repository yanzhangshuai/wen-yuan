import { NameType } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { createUpdatePersonaService } from "@/server/modules/personas/updatePersona";

describe("updatePersona service", () => {
  it("updates persona fields with normalization", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "persona-1" });
    const update = vi.fn().mockResolvedValue({
      id        : "persona-1",
      name      : "周进",
      aliases   : ["周学道", "周大人"],
      gender    : "男",
      hometown  : "会稽",
      nameType  : NameType.NAMED,
      globalTags: ["儒生"],
      confidence: 0.82,
      updatedAt : new Date("2026-03-25T00:00:00.000Z")
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst,
        update
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    const result = await service.updatePersona("persona-1", {
      name      : " 周进 ",
      aliases   : ["周学道", " 周大人 ", "周学道"],
      globalTags: ["儒生", " 儒生 "],
      gender    : " 男 ",
      hometown  : " 会稽 ",
      confidence: 0.82
    });

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        id       : "persona-1",
        deletedAt: null
      })
    }));
    expect(update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "persona-1" },
      data : expect.objectContaining({
        name      : "周进",
        aliases   : ["周学道", "周大人"],
        globalTags: ["儒生"],
        gender    : "男",
        hometown  : "会稽",
        confidence: 0.82
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id        : "persona-1",
      name      : "周进",
      aliases   : ["周学道", "周大人"],
      globalTags: ["儒生"]
    }));
  });

  it("throws not found when persona does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createUpdatePersonaService({
      $transaction: transaction
    } as never);

    await expect(service.updatePersona("missing", { name: "周进" }))
      .rejects.toBeInstanceOf(PersonaNotFoundError);
  });
});
