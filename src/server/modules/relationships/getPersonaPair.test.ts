import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";
import { createGetPersonaPairService } from "@/server/modules/relationships/getPersonaPair";

const BOOK_ID = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
const PERSONA_A_ID = "c53ac0ff-dfd6-49fc-907d-2df562f5ed06";
const PERSONA_B_ID = "b694a898-9a48-4f55-b62d-b946b57d067d";

function createPrismaMock(args: {
  book         ?: { id: string } | null;
  personas     ?: Array<{ id: string; name: string; aliases: string[] }>;
  relationships?: unknown[];
} = {}) {
  const book = Object.hasOwn(args, "book") ? args.book : { id: BOOK_ID };

  return {
    book: {
      findFirst: vi.fn().mockResolvedValue(book)
    },
    persona: {
      findMany: vi.fn().mockResolvedValue(args.personas ?? [
        { id: PERSONA_A_ID, name: "范进", aliases: ["范老爷"] },
        { id: PERSONA_B_ID, name: "周进", aliases: [] }
      ])
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue(args.relationships ?? [])
    }
  };
}

function buildRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id                  : "rel-1",
    sourceId            : PERSONA_A_ID,
    targetId            : PERSONA_B_ID,
    relationshipTypeCode: "teacher_student",
    relationshipType    : {
      code            : "teacher_student",
      name            : "师生",
      group           : "师承",
      directionMode   : "INVERSE",
      reverseEdgeLabel: "学生"
    },
    recordSource: RecordSource.MANUAL,
    status      : ProcessingStatus.VERIFIED,
    events      : [
      {
        id          : "event-2",
        chapterId   : "chapter-2",
        chapterNo   : 5,
        sourceId    : PERSONA_A_ID,
        targetId    : PERSONA_B_ID,
        summary     : "周进提携范进",
        evidence    : "原文证据二",
        attitudeTags: ["提携"],
        paraIndex   : 4,
        confidence  : 0.91,
        recordSource: RecordSource.AI,
        status      : ProcessingStatus.DRAFT,
        chapter     : { id: "chapter-2", no: 5, title: "第五回" }
      },
      {
        id          : "event-1",
        chapterId   : "chapter-1",
        chapterNo   : 2,
        sourceId    : PERSONA_A_ID,
        targetId    : PERSONA_B_ID,
        summary     : "范进拜见周进",
        evidence    : null,
        attitudeTags: [],
        paraIndex   : 1,
        confidence  : 0.8,
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED,
        chapter     : { id: "chapter-1", no: 2, title: "第二回" }
      }
    ],
    ...overrides
  };
}

describe("getPersonaPair service", () => {
  it("returns personas in requested order and aggregates relationship events", async () => {
    const relationship = buildRelationship();
    const prisma = createPrismaMock({ relationships: [relationship] });
    const service = createGetPersonaPairService(prisma as never);

    const result = await service.getPersonaPair({
      bookId: BOOK_ID,
      aId   : PERSONA_A_ID,
      bId   : PERSONA_B_ID
    });

    expect(prisma.book.findFirst).toHaveBeenCalledWith({
      where : { id: BOOK_ID, deletedAt: null },
      select: { id: true }
    });
    expect(prisma.persona.findMany).toHaveBeenCalledWith({
      where : { id: { in: [PERSONA_A_ID, PERSONA_B_ID] }, deletedAt: null },
      select: { id: true, name: true, aliases: true }
    });
    expect(prisma.relationship.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        bookId   : BOOK_ID,
        deletedAt: null,
        OR       : [
          { sourceId: PERSONA_A_ID, targetId: PERSONA_B_ID },
          { sourceId: PERSONA_B_ID, targetId: PERSONA_A_ID }
        ]
      },
      orderBy: [{ relationshipTypeCode: "asc" }]
    }));
    expect(result.personas.map((persona) => persona.id)).toEqual([PERSONA_A_ID, PERSONA_B_ID]);
    expect(result.relationships).toEqual([
      {
        id                  : "rel-1",
        sourceId            : PERSONA_A_ID,
        targetId            : PERSONA_B_ID,
        relationshipTypeCode: "teacher_student",
        relationshipType    : {
          code         : "teacher_student",
          name         : "师生",
          group        : "师承",
          directionMode: "INVERSE",
          inverseLabel : "学生"
        },
        recordSource  : RecordSource.MANUAL,
        status        : ProcessingStatus.VERIFIED,
        firstChapterNo: 2,
        lastChapterNo : 5,
        eventCount    : 2,
        events        : [
          expect.objectContaining({ id: "event-2", chapterNo: 5, chapterTitle: "第五回" }),
          expect.objectContaining({ id: "event-1", chapterNo: 2, chapterTitle: "第二回" })
        ]
      }
    ]);
  });

  it("returns an empty relationship list when the pair has no relationship", async () => {
    const service = createGetPersonaPairService(createPrismaMock() as never);

    await expect(service.getPersonaPair({
      bookId: BOOK_ID,
      aId   : PERSONA_A_ID,
      bId   : PERSONA_B_ID
    })).resolves.toEqual({
      bookId  : BOOK_ID,
      aId     : PERSONA_A_ID,
      bId     : PERSONA_B_ID,
      personas: [
        { id: PERSONA_A_ID, name: "范进", aliases: ["范老爷"], portraitUrl: null },
        { id: PERSONA_B_ID, name: "周进", aliases: [], portraitUrl: null }
      ],
      relationships: []
    });
  });

  it("filters soft-deleted relationships and events in the Prisma query", async () => {
    const prisma = createPrismaMock();
    const service = createGetPersonaPairService(prisma as never);

    await service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID });

    expect(prisma.relationship.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where  : expect.objectContaining({ deletedAt: null }),
      include: expect.objectContaining({
        events: expect.objectContaining({
          where: { deletedAt: null }
        })
      })
    }));
  });

  it("keeps both relationship directions and preserves service output order from Prisma", async () => {
    const forward = buildRelationship({ id: "rel-a", relationshipTypeCode: "ally" });
    const backward = buildRelationship({
      id                  : "rel-b",
      sourceId            : PERSONA_B_ID,
      targetId            : PERSONA_A_ID,
      relationshipTypeCode: "enemy"
    });
    const service = createGetPersonaPairService(createPrismaMock({
      relationships: [forward, backward]
    }) as never);

    const result = await service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID });

    expect(result.relationships.map((relationship) => relationship.id)).toEqual(["rel-a", "rel-b"]);
    expect(result.relationships[1]).toEqual(expect.objectContaining({
      sourceId: PERSONA_B_ID,
      targetId: PERSONA_A_ID
    }));
  });

  it("throws BookNotFoundError when the book is missing", async () => {
    const service = createGetPersonaPairService(createPrismaMock({ book: null }) as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID }))
      .rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("throws PersonaNotFoundError for the first missing persona in request order", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      personas: [{ id: PERSONA_B_ID, name: "周进", aliases: [] }]
    }) as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID }))
      .rejects.toMatchObject({ personaId: PERSONA_A_ID });
  });

  it("throws PersonaNotFoundError when the second persona is missing", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      personas: [{ id: PERSONA_A_ID, name: "范进", aliases: [] }]
    }) as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID }))
      .rejects.toMatchObject({ personaId: PERSONA_B_ID });
  });

  it("rejects a pair that points to the same persona", async () => {
    const service = createGetPersonaPairService(createPrismaMock() as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_A_ID }))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("uses null aggregate chapter numbers when a relationship has no active events", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      relationships: [buildRelationship({ events: [] })]
    }) as never);

    const result = await service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID });

    expect(result.relationships[0]).toEqual(expect.objectContaining({
      firstChapterNo: null,
      lastChapterNo : null,
      eventCount    : 0,
      events        : []
    }));
  });

  it("rejects invalid relationship direction modes from dictionary data", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      relationships: [
        buildRelationship({
          relationshipType: {
            code            : "unknown",
            name            : "未知",
            group           : "其他",
            directionMode   : "SIDEWAYS",
            reverseEdgeLabel: null
          }
        })
      ]
    }) as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID }))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });
});
