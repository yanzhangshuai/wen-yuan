import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import {
  createGetPersonaByIdService,
  PersonaNotFoundError
} from "@/server/modules/personas/getPersonaById";

describe("getPersonaById service", () => {
  it("returns persona detail snapshot", async () => {
    const service = createGetPersonaByIdService({
      persona: {
        findFirst: vi.fn().mockResolvedValue({
          id          : "persona-1",
          name        : "周进",
          aliases     : ["周学道"],
          gender      : "男",
          hometown    : "会稽",
          nameType    : "NAMED",
          recordSource: RecordSource.AI,
          confidence  : 0.96,
          profiles    : [
            {
              id           : "profile-1",
              bookId       : "book-1",
              localName    : "周进",
              localSummary : "旧儒生",
              officialTitle: "学道",
              localTags    : ["清苦"],
              ironyIndex   : 2.2,
              book         : { title: "儒林外史" }
            }
          ]
        })
      },
      biographyRecord: {
        findMany: vi.fn().mockResolvedValue([
          {
            id          : "bio-1",
            chapterId   : "chapter-1",
            chapterNo   : 1,
            category    : "EVENT",
            title       : null,
            location    : null,
            event       : "出场",
            recordSource: RecordSource.AI,
            status      : ProcessingStatus.DRAFT,
            chapter     : {
              bookId: "book-1",
              book  : { title: "儒林外史" }
            }
          }
        ])
      },
      relationship: {
        findMany: vi.fn().mockResolvedValue([
          {
            id          : "rel-1",
            chapterId   : "chapter-1",
            type        : "师生",
            weight      : 1.2,
            evidence    : "原文证据",
            recordSource: RecordSource.AI,
            status      : ProcessingStatus.DRAFT,
            sourceId    : "persona-1",
            targetId    : "persona-2",
            source      : { id: "persona-1", name: "周进" },
            target      : { id: "persona-2", name: "范进" },
            chapter     : {
              no    : 1,
              bookId: "book-1",
              book  : { title: "儒林外史" }
            }
          }
        ])
      }
    } as never);

    const result = await service.getPersonaById("persona-1");

    expect(result.id).toBe("persona-1");
    expect(result.status).toBe(ProcessingStatus.DRAFT);
    expect(result.timeline).toHaveLength(1);
    expect(result.relationships[0]).toEqual(expect.objectContaining({
      direction      : "outgoing",
      counterpartName: "范进"
    }));
  });

  it("throws not found when persona is missing", async () => {
    const service = createGetPersonaByIdService({
      persona: {
        findFirst: vi.fn().mockResolvedValue(null)
      }
    } as never);

    await expect(service.getPersonaById("missing")).rejects.toBeInstanceOf(PersonaNotFoundError);
  });
});
