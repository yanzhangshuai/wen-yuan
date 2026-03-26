import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, BioCategory, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const createPersonaBiographyMock = vi.fn();

vi.mock("@/server/modules/biography/createPersonaBiography", () => ({
  createPersonaBiography: createPersonaBiographyMock
}));

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

vi.mock("@/server/modules/biography/errors", () => {
  class BiographyInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return { BiographyInputError };
});

describe("POST /api/personas/:id/biography", () => {
  afterEach(() => {
    createPersonaBiographyMock.mockReset();
  });

  it("creates manual biography record", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    createPersonaBiographyMock.mockResolvedValue({
      id          : "biography-1",
      personaId,
      chapterId,
      chapterNo   : 1,
      category    : BioCategory.EVENT,
      title       : "中举",
      location    : "会稽",
      event       : "周进中举",
      virtualYear : null,
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED,
      createdAt   : "2026-03-25T00:00:00.000Z"
    });
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.code).toBe("PERSONA_BIOGRAPHY_CREATED");
    expect(createPersonaBiographyMock).toHaveBeenCalledWith(personaId, {
      chapterId,
      event: "周进中举"
    });
  });

  it("returns 403 when viewer requests", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(403);
    expect(createPersonaBiographyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId: "invalid",
        event    : ""
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(400);
    expect(createPersonaBiographyMock).not.toHaveBeenCalled();
  });

  it("returns 404 when persona missing", async () => {
    const personaId = "deb2ea4c-e758-4ea8-b40b-5e7e4376e12b";
    const chapterId = "b53fc2ca-6f86-4cd6-ac3d-694f402e570e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    createPersonaBiographyMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/personas/${personaId}/biography`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId,
        event: "周进中举"
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
