import { afterEach, describe, expect, it, vi } from "vitest";

const getPersonaDetailMock = vi.fn();

vi.mock("@/server/modules/graph/getPersonaDetail", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return {
    getPersonaDetail: getPersonaDetailMock,
    PersonaNotFoundError
  };
});

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

/**
 * 文件定位（人物详情动态接口路由单测）：
 * - 对应 `app/api/books/[id]/personas/[personaId]/route.ts`。
 * - `[id]` 为书籍 UUID，`[personaId]` 为人物 UUID，二者共同限定查询域。
 */
describe("GET /api/books/:id/personas/:personaId", () => {
  const bookId = "36660de7-2ec6-4f73-ab2b-06fa8d7f8544";
  const personaId = "6a6cb0bc-8a49-4122-ba49-d24a1002d2d8";

  afterEach(() => {
    getPersonaDetailMock.mockReset();
  });

  it("returns persona detail", async () => {
    getPersonaDetailMock.mockResolvedValue({
      id             : personaId,
      name           : "周进",
      nameType       : "NAMED",
      entityType     : "PERSON",
      status         : "DRAFT",
      confidence     : 0.9,
      gender         : null,
      hometown       : null,
      aliases        : [],
      globalTags     : [],
      summary        : null,
      profile        : null,
      relationships  : [],
      timeline       : [],
      appearanceCount: 0
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas/${personaId}`),
      { params: Promise.resolve({ id: bookId, personaId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("PERSONA_DETAIL_FETCHED");
    expect(getPersonaDetailMock).toHaveBeenCalledWith({ bookId, personaId });
  });

  it("returns 400 for invalid personaId", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas/not-a-uuid`),
      { params: Promise.resolve({ id: bookId, personaId: "not-a-uuid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(getPersonaDetailMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid bookId", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/not-a-uuid/personas/${personaId}`),
      { params: Promise.resolve({ id: "not-a-uuid", personaId }) }
    );

    expect(response.status).toBe(400);
    expect(getPersonaDetailMock).not.toHaveBeenCalled();
  });

  it("returns 404 when book is missing", async () => {
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    getPersonaDetailMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas/${personaId}`),
      { params: Promise.resolve({ id: bookId, personaId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 404 when persona is missing", async () => {
    const { PersonaNotFoundError } = await import("@/server/modules/graph/getPersonaDetail");
    getPersonaDetailMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas/${personaId}`),
      { params: Promise.resolve({ id: bookId, personaId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
