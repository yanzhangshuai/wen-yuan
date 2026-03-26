import { afterEach, describe, expect, it, vi } from "vitest";

const findPersonaPathMock = vi.fn();

vi.mock("@/server/modules/graph/findPersonaPath", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return {
    findPersonaPath: findPersonaPathMock,
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

describe("POST /api/graph/path", () => {
  afterEach(() => {
    findPersonaPathMock.mockReset();
  });

  it("returns shortest path data", async () => {
    const payload = {
      bookId         : "9f2507a6-f363-4562-ad4d-7a6ecbf75e9e",
      sourcePersonaId: "6a6cb0bc-8a49-4122-ba49-d24a1002d2d8",
      targetPersonaId: "d7d8b685-fef8-4195-bbe7-b903c1d4e0e2"
    };

    findPersonaPathMock.mockResolvedValue({
      ...payload,
      found   : true,
      hopCount: 2,
      nodes   : [
        { id: payload.sourcePersonaId, name: "王冕" },
        { id: "70169163-7d0a-43b9-88f6-58d4ee26af4f", name: "周进" },
        { id: payload.targetPersonaId, name: "范进" }
      ],
      edges: [
        {
          id       : "rel-1",
          source   : payload.sourcePersonaId,
          target   : "70169163-7d0a-43b9-88f6-58d4ee26af4f",
          type     : "师生",
          weight   : 1,
          chapterId: "c1",
          chapterNo: 1
        },
        {
          id       : "rel-2",
          source   : "70169163-7d0a-43b9-88f6-58d4ee26af4f",
          target   : payload.targetPersonaId,
          type     : "同僚",
          weight   : 1,
          chapterId: "c2",
          chapterNo: 2
        }
      ]
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/graph/path", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }));

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.code).toBe("GRAPH_PATH_SEARCHED");
    expect(findPersonaPathMock).toHaveBeenCalledWith(payload);
  });

  it("returns 400 for invalid body", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/graph/path", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        bookId         : "invalid",
        sourcePersonaId: "invalid",
        targetPersonaId: "invalid"
      })
    }));

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("COMMON_BAD_REQUEST");
    expect(findPersonaPathMock).not.toHaveBeenCalled();
  });

  it("returns 404 for missing persona", async () => {
    const payload = {
      bookId         : "9f2507a6-f363-4562-ad4d-7a6ecbf75e9e",
      sourcePersonaId: "6a6cb0bc-8a49-4122-ba49-d24a1002d2d8",
      targetPersonaId: "d7d8b685-fef8-4195-bbe7-b903c1d4e0e2"
    };

    const { PersonaNotFoundError } = await import("@/server/modules/graph/findPersonaPath");
    findPersonaPathMock.mockRejectedValue(new PersonaNotFoundError(payload.targetPersonaId));

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/graph/path", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    }));

    expect(response.status).toBe(404);
    const json = await response.json();
    expect(json.success).toBe(false);
    expect(json.code).toBe("COMMON_NOT_FOUND");
  });
});
