import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, NameType } from "@/generated/prisma/enums";

const getPersonaByIdMock = vi.fn();
const updatePersonaMock = vi.fn();
const deletePersonaMock = vi.fn();

vi.mock("@/server/modules/personas/getPersonaById", () => ({
  getPersonaById: getPersonaByIdMock
}));

vi.mock("@/server/modules/personas/updatePersona", () => ({
  updatePersona: updatePersonaMock
}));

vi.mock("@/server/modules/personas/deletePersona", () => ({
  deletePersona: deletePersonaMock
}));

vi.mock("@/server/modules/personas/errors", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  return {
    PersonaNotFoundError
  };
});

describe("GET /api/personas/:id", () => {
  afterEach(() => {
    getPersonaByIdMock.mockReset();
    updatePersonaMock.mockReset();
    deletePersonaMock.mockReset();
  });

  it("returns persona detail", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    getPersonaByIdMock.mockResolvedValue({
      id  : personaId,
      name: "周进"
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/personas/${personaId}`),
      { params: Promise.resolve({ id: personaId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("PERSONA_FETCHED");
    expect(getPersonaByIdMock).toHaveBeenCalledWith(personaId);
  });

  it("returns 400 when id is invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/personas/invalid"),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(getPersonaByIdMock).not.toHaveBeenCalled();
  });

  it("returns 404 when persona is missing", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    getPersonaByIdMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/personas/${personaId}`),
      { params: Promise.resolve({ id: personaId }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

describe("PATCH /api/personas/:id", () => {
  afterEach(() => {
    getPersonaByIdMock.mockReset();
    updatePersonaMock.mockReset();
    deletePersonaMock.mockReset();
  });

  it("updates persona when admin requests", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    updatePersonaMock.mockResolvedValue({
      id        : personaId,
      name      : "周进",
      aliases   : ["周学道"],
      gender    : "男",
      hometown  : "会稽",
      nameType  : NameType.NAMED,
      globalTags: ["儒生"],
      confidence: 0.88,
      updatedAt : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        name      : "周进",
        aliases   : ["周学道"],
        confidence: 0.88
      })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("PERSONA_UPDATED");
    expect(updatePersonaMock).toHaveBeenCalledWith(personaId, {
      name      : "周进",
      aliases   : ["周学道"],
      confidence: 0.88
    });
  });

  it("returns 403 for viewer", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({ name: "周进" })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(403);
    expect(updatePersonaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ confidence: 1.5 })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(400);
    expect(updatePersonaMock).not.toHaveBeenCalled();
  });

  it("returns 404 when persona is missing", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    updatePersonaMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ name: "周进" })
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

describe("DELETE /api/personas/:id", () => {
  afterEach(() => {
    getPersonaByIdMock.mockReset();
    updatePersonaMock.mockReset();
    deletePersonaMock.mockReset();
  });

  it("deletes persona when admin requests", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    deletePersonaMock.mockResolvedValue({
      id       : personaId,
      deletedAt: "2026-03-25T00:00:00.000Z",
      cascaded : {
        relationshipCount: 2,
        biographyCount   : 1,
        mentionCount     : 1,
        profileCount     : 1
      }
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("PERSONA_DELETED");
    expect(deletePersonaMock).toHaveBeenCalledWith(personaId);
  });

  it("returns 403 for viewer", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.VIEWER
      }
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(403);
    expect(deletePersonaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when id is invalid", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request("http://localhost/api/personas/invalid", {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: "invalid" }) });

    expect(response.status).toBe(400);
    expect(deletePersonaMock).not.toHaveBeenCalled();
  });

  it("returns 404 when persona is missing", async () => {
    const personaId = "6d97e7f0-72b8-4855-b902-14f32eaf226e";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/errors");
    deletePersonaMock.mockRejectedValue(new PersonaNotFoundError(personaId));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/personas/${personaId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: personaId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
