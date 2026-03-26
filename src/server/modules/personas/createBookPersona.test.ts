import { NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createCreateBookPersonaService } from "@/server/modules/personas/createBookPersona";

describe("createBookPersona service", () => {
  it("creates manual persona and profile in one transaction", async () => {
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const personaCreate = vi.fn().mockResolvedValue({
      id          : "persona-1",
      name        : "周进",
      aliases     : ["周学道"],
      gender      : "男",
      hometown    : "会稽",
      nameType    : NameType.NAMED,
      globalTags  : ["儒生"],
      confidence  : 1,
      recordSource: RecordSource.MANUAL
    });
    const profileCreate = vi.fn().mockResolvedValue({
      id           : "profile-1",
      localName    : "周进",
      localSummary : null,
      officialTitle: null,
      localTags    : ["清苦"],
      ironyIndex   : 0
    });
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: bookFindFirst
      },
      persona: {
        create: personaCreate
      },
      profile: {
        create: profileCreate
      }
    }));
    const service = createCreateBookPersonaService({
      $transaction: transaction
    } as never);

    const result = await service.createBookPersona("book-1", {
      name     : " 周进 ",
      aliases  : ["周学道", " 周学道 "],
      localTags: ["清苦"]
    });

    expect(personaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name        : "周进",
        aliases     : ["周学道"],
        recordSource: RecordSource.MANUAL
      })
    }));
    expect(profileCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookId   : "book-1",
        localName: "周进"
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      id          : "persona-1",
      profileId   : "profile-1",
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED
    }));
  });

  it("throws not found when book does not exist", async () => {
    const transaction = vi.fn().mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    }));
    const service = createCreateBookPersonaService({
      $transaction: transaction
    } as never);

    await expect(service.createBookPersona("missing", {
      name: "周进"
    })).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
