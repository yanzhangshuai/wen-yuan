import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const getPersonaPairMock = vi.fn();

vi.mock("@/server/modules/relationships/getPersonaPair", () => ({
  getPersonaPair: getPersonaPairMock
}));

vi.mock("@/server/modules/books/errors", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  return { BookNotFoundError };
});

vi.mock("@/server/modules/personas/errors", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return { PersonaNotFoundError };
});

vi.mock("@/server/modules/relationships/errors", () => {
  class RelationshipInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return { RelationshipInputError };
});

const BOOK_ID = "3ef159df-cd11-44b9-8afb-84b2f5db8c72";
const PERSONA_A_ID = "c53ac0ff-dfd6-49fc-907d-2df562f5ed06";
const PERSONA_B_ID = "b694a898-9a48-4f55-b62d-b946b57d067d";

function routeContext(params: { bookId?: string; aId?: string; bId?: string }) {
  return {
    params: Promise.resolve({
      bookId: params.bookId ?? BOOK_ID,
      aId   : params.aId ?? PERSONA_A_ID,
      bId   : params.bId ?? PERSONA_B_ID
    })
  };
}

describe("GET /api/persona-pairs/:bookId/:aId/:bId", () => {
  afterEach(() => {
    getPersonaPairMock.mockReset();
  });

  it("returns the pair aggregation payload for authenticated users", async () => {
    const payload = {
      bookId       : BOOK_ID,
      aId          : PERSONA_A_ID,
      bId          : PERSONA_B_ID,
      personas     : [],
      relationships: [{
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
        firstChapterNo: 1,
        lastChapterNo : 3,
        eventCount    : 2,
        events        : []
      }]
    };
    getPersonaPairMock.mockResolvedValue(payload);
    const { GET } = await import("./route");

    const response = await GET(new Request(`http://localhost/api/persona-pairs/${BOOK_ID}/${PERSONA_A_ID}/${PERSONA_B_ID}`, {
      headers: { "x-auth-role": AppRole.ADMIN }
    }), routeContext({}));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.code).toBe("PERSONA_PAIR_FETCHED");
    expect(body.data).toEqual(payload);
    expect(getPersonaPairMock).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      aId   : PERSONA_A_ID,
      bId   : PERSONA_B_ID
    });
  });

  it("returns 401 when the request is unauthenticated", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/persona-pairs/${BOOK_ID}/${PERSONA_A_ID}/${PERSONA_B_ID}`),
      routeContext({})
    );

    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.code).toBe("AUTH_UNAUTHORIZED");
    expect(getPersonaPairMock).not.toHaveBeenCalled();
  });

  it("returns 400 when a route id is not a UUID", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/persona-pairs/not-a-uuid/${PERSONA_A_ID}/${PERSONA_B_ID}`, {
        headers: { "x-auth-role": AppRole.ADMIN }
      }),
      routeContext({ bookId: "not-a-uuid" })
    );

    expect(response.status).toBe(400);
    expect(getPersonaPairMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the pair points to the same persona", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request(`http://localhost/api/persona-pairs/${BOOK_ID}/${PERSONA_A_ID}/${PERSONA_A_ID}`, {
      headers: { "x-auth-role": AppRole.ADMIN }
    }), routeContext({ bId: PERSONA_A_ID }));

    expect(response.status).toBe(400);
    expect(getPersonaPairMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the book is missing", async () => {
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    getPersonaPairMock.mockRejectedValue(new BookNotFoundError(BOOK_ID));
    const { GET } = await import("./route");

    const response = await GET(new Request(`http://localhost/api/persona-pairs/${BOOK_ID}/${PERSONA_A_ID}/${PERSONA_B_ID}`, {
      headers: { "x-auth-role": AppRole.ADMIN }
    }), routeContext({}));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 404 when a persona is missing", async () => {
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    getPersonaPairMock.mockRejectedValue(new PersonaNotFoundError(PERSONA_A_ID));
    const { GET } = await import("./route");

    const response = await GET(new Request(`http://localhost/api/persona-pairs/${BOOK_ID}/${PERSONA_A_ID}/${PERSONA_B_ID}`, {
      headers: { "x-auth-role": AppRole.ADMIN }
    }), routeContext({}));

    expect(response.status).toBe(404);
    const body = await response.json();
    expect(body.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 400 when the service rejects the pair input", async () => {
    const { RelationshipInputError } = await import("@/server/modules/relationships/errors");
    getPersonaPairMock.mockRejectedValue(new RelationshipInputError("起点和终点不能相同"));
    const { GET } = await import("./route");

    const response = await GET(new Request(`http://localhost/api/persona-pairs/${BOOK_ID}/${PERSONA_A_ID}/${PERSONA_B_ID}`, {
      headers: { "x-auth-role": AppRole.ADMIN }
    }), routeContext({}));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.code).toBe("COMMON_BAD_REQUEST");
  });
});
