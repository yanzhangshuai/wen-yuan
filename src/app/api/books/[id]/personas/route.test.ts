import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const listBookPersonasMock = vi.fn();
const createBookPersonaMock = vi.fn();

vi.mock("@/server/modules/personas/listBookPersonas", () => ({
  listBookPersonas: listBookPersonasMock
}));

vi.mock("@/server/modules/personas/createBookPersona", () => ({
  createBookPersona: createBookPersonaMock
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

describe("GET /api/books/:id/personas", () => {
  afterEach(() => {
    listBookPersonasMock.mockReset();
    createBookPersonaMock.mockReset();
  });

  it("returns personas list", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    listBookPersonasMock.mockResolvedValue([
      {
        id           : "persona-1",
        profileId    : "profile-1",
        bookId,
        name         : "周进",
        localName    : "周进",
        aliases      : ["周学道"],
        gender       : "男",
        hometown     : "会稽",
        nameType     : NameType.NAMED,
        globalTags   : ["儒生"],
        localTags    : ["清苦"],
        officialTitle: null,
        localSummary : null,
        ironyIndex   : 0,
        confidence   : 1,
        recordSource : RecordSource.MANUAL,
        status       : ProcessingStatus.VERIFIED
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/books/${bookId}/personas`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_PERSONAS_FETCHED");
    expect(listBookPersonasMock).toHaveBeenCalledWith(bookId);
  });

  it("returns 400 for invalid book id", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/books/invalid/personas"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    expect(listBookPersonasMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/books/:id/personas", () => {
  afterEach(() => {
    listBookPersonasMock.mockReset();
    createBookPersonaMock.mockReset();
  });

  it("creates a manual persona", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    createBookPersonaMock.mockResolvedValue({
      id           : "persona-1",
      profileId    : "profile-1",
      bookId,
      name         : "周进",
      localName    : "周进",
      aliases      : ["周学道"],
      gender       : "男",
      hometown     : "会稽",
      nameType     : NameType.NAMED,
      globalTags   : ["儒生"],
      localTags    : ["清苦"],
      localSummary : null,
      officialTitle: null,
      ironyIndex   : 0,
      confidence   : 1,
      recordSource : RecordSource.MANUAL,
      status       : ProcessingStatus.VERIFIED
    });
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name   : "周进",
        aliases: ["周学道"]
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.code).toBe("BOOK_PERSONA_CREATED");
    expect(createBookPersonaMock).toHaveBeenCalledWith(bookId, {
      name   : "周进",
      aliases: ["周学道"]
    });
  });

  it("returns 403 when viewer creates persona", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        name: "周进"
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(403);
    expect(createBookPersonaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/books/${bookId}/personas`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name: ""
      })
    }), { params: Promise.resolve({ id: bookId }) });

    expect(response.status).toBe(400);
    expect(createBookPersonaMock).not.toHaveBeenCalled();
  });
});
