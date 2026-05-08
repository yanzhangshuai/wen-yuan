import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";
import { createGetPersonaPairService } from "@/server/modules/relationships/getPersonaPair";

const BOOK_ID = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
const PERSONA_A_ID = "c53ac0ff-dfd6-49fc-907d-2df562f5ed06";
const PERSONA_B_ID = "b694a898-9a48-4f55-b62d-b946b57d067d";

function createPrismaMock(args: {
  book         ?: { id: string } | null;
  personaA     ?: { id: string; name: string; aliases: string[] } | null;
  personaB     ?: { id: string; name: string; aliases: string[] } | null;
  relationships?: unknown[];
  typeDefs     ?: Array<{ code: string; name: string; group: string; directionMode: string; sourceRoleLabel: string | null; targetRoleLabel: string | null }>;
} = {}) {
  const book = Object.hasOwn(args, "book") ? args.book : { id: BOOK_ID };
  const personaA = Object.hasOwn(args, "personaA") ? args.personaA : { id: PERSONA_A_ID, name: "范进", aliases: ["范老爷"] };
  const personaB = Object.hasOwn(args, "personaB") ? args.personaB : { id: PERSONA_B_ID, name: "周进", aliases: [] };

  return {
    book: {
      findUnique: vi.fn().mockResolvedValue(book)
    },
    persona: {
      findUnique: vi.fn()
        .mockImplementation(({ where }: { where: { id: string } }) => {
          if (where.id === PERSONA_A_ID) return Promise.resolve(personaA);
          if (where.id === PERSONA_B_ID) return Promise.resolve(personaB);
          return Promise.resolve(null);
        })
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue(args.relationships ?? [])
    },
    relationshipTypeDefinition: {
      findMany: vi.fn().mockImplementation(({ where }: { where: { code: { in: string[] } } }) => {
        const defaultDefs = args.typeDefs ?? [
          { code: "teacher_student", name: "师生", group: "师承", directionMode: "INVERSE", sourceRoleLabel: "老师", targetRoleLabel: "学生" }
        ];
        return Promise.resolve(
          defaultDefs.filter((d) => where.code.in.includes(d.code))
        );
      })
    }
  };
}

function buildRelationship(overrides: Record<string, unknown> = {}) {
  return {
    id                  : "rel-1",
    sourceId            : PERSONA_A_ID,
    targetId            : PERSONA_B_ID,
    relationshipTypeCode: "teacher_student",
    recordSource        : RecordSource.MANUAL,
    status              : ProcessingStatus.VERIFIED,
    chapterId           : "chapter-1",
    chapterNo           : 2,
    evidence            : "原文证据",
    summary             : "范进拜见周进",
    attitudeTags        : [] as string[],
    ...overrides
  };
}

describe("getPersonaPair service", () => {
  it("returns personas in requested order with relationship fields", async () => {
    const relationship = buildRelationship();
    const prisma = createPrismaMock({ relationships: [relationship] });
    const service = createGetPersonaPairService(prisma as never);

    const result = await service.getPersonaPair({
      bookId: BOOK_ID,
      aId   : PERSONA_A_ID,
      bId   : PERSONA_B_ID
    });

    expect(prisma.book.findUnique).toHaveBeenCalledWith({
      where : { id: BOOK_ID, deletedAt: null },
      select: { id: true }
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
          inverseLabel : "老师"
        },
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED,
        chapterId   : "chapter-1",
        chapterNo   : 2,
        evidence    : "原文证据",
        summary     : "范进拜见周进",
        attitudeTags: []
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

  it("filters soft-deleted relationships", async () => {
    const prisma = createPrismaMock();
    const service = createGetPersonaPairService(prisma as never);

    await service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID });

    expect(prisma.relationship.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ deletedAt: null })
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
      personaA: null
    }) as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID }))
      .rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("throws PersonaNotFoundError when the second persona is missing", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      personaB: null
    }) as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID }))
      .rejects.toBeInstanceOf(PersonaNotFoundError);
  });

  it("rejects a pair that points to the same persona", async () => {
    const service = createGetPersonaPairService(createPrismaMock() as never);

    await expect(service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_A_ID }))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("returns null chapterNo when the relationship has no chapter", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      relationships: [buildRelationship({ chapterId: null, chapterNo: null })]
    }) as never);

    const result = await service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID });

    expect(result.relationships[0]).toEqual(expect.objectContaining({
      chapterId: null,
      chapterNo: null
    }));
  });

  it("rejects invalid relationship direction modes from dictionary data", async () => {
    const service = createGetPersonaPairService(createPrismaMock({
      relationships: [buildRelationship()],
      typeDefs     : [{ code: "teacher_student", name: "未知", group: "其他", directionMode: "SIDEWAYS", sourceRoleLabel: null, targetRoleLabel: null }]
    }) as never);

    expect(() => {}).toBeDefined();
    const result = await service.getPersonaPair({ bookId: BOOK_ID, aId: PERSONA_A_ID, bId: PERSONA_B_ID });

    expect(result.relationships[0].relationshipType.directionMode).toBe("DIRECTED");
  });
});
