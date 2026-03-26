import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createListBookPersonasService } from "@/server/modules/personas/listBookPersonas";

describe("listBookPersonas service", () => {
  it("returns mapped personas for a book", async () => {
    const findFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const findMany = vi.fn().mockResolvedValue([
      {
        id           : "profile-1",
        bookId       : "book-1",
        localName    : "周进",
        localSummary : "旧儒生",
        officialTitle: "学道",
        localTags    : ["清苦"],
        ironyIndex   : 3.1,
        persona      : {
          id          : "persona-1",
          name        : "周进",
          aliases     : ["周学道"],
          gender      : "男",
          hometown    : "会稽",
          nameType    : "NAMED",
          globalTags  : ["儒生"],
          confidence  : 1,
          recordSource: RecordSource.MANUAL
        }
      }
    ]);
    const service = createListBookPersonasService({
      book: {
        findFirst
      },
      profile: {
        findMany
      }
    } as never);

    const result = await service.listBookPersonas("book-1");

    expect(findFirst).toHaveBeenCalled();
    expect(findMany).toHaveBeenCalled();
    expect(result).toEqual([
      expect.objectContaining({
        id          : "persona-1",
        profileId   : "profile-1",
        status      : ProcessingStatus.VERIFIED,
        recordSource: RecordSource.MANUAL
      })
    ]);
  });

  it("throws not found when book does not exist", async () => {
    const service = createListBookPersonasService({
      book: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.listBookPersonas("missing"))
      .rejects.toBeInstanceOf(BookNotFoundError);
  });
});
