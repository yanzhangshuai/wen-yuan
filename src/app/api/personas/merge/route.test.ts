import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const mergePersonasMock = vi.fn();

vi.mock("@/server/modules/personas/mergePersonas", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  class PersonaMergeInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    mergePersonas: mergePersonasMock,
    PersonaNotFoundError,
    PersonaMergeInputError
  };
});

describe("POST /api/personas/merge", () => {
  afterEach(() => {
    mergePersonasMock.mockReset();
    vi.resetModules();
  });

  it("merges two personas and returns 200", async () => {
    mergePersonasMock.mockResolvedValue({
      sourceId                : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
      targetId                : "2fd91a82-0492-4c9a-ae0d-f3376517e578",
      redirectedRelationships : 3,
      rejectedRelationships   : 1,
      redirectedBiographyCount: 4,
      redirectedMentionCount  : 6
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId: "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("PERSONA_MERGED");
    expect(mergePersonasMock).toHaveBeenCalledWith({
      sourceId: "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
      targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
    });
  });

  it("returns 403 for viewer", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        sourceId: "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
      })
    }));

    expect(response.status).toBe(403);
    expect(mergePersonasMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId: "invalid-id",
        targetId: "2fd91a82-0492-4c9a-ae0d-f3376517e578"
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(mergePersonasMock).not.toHaveBeenCalled();
  });

  it("maps PersonaNotFoundError to 404", async () => {
    const sourceId = "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8";
    const targetId = "2fd91a82-0492-4c9a-ae0d-f3376517e578";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/mergePersonas");
    mergePersonasMock.mockRejectedValue(new PersonaNotFoundError(sourceId));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId,
        targetId
      })
    }));

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("maps PersonaMergeInputError to 400", async () => {
    const sourceId = "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8";
    const targetId = "2fd91a82-0492-4c9a-ae0d-f3376517e578";
    const { PersonaMergeInputError } = await import("@/server/modules/personas/mergePersonas");
    mergePersonasMock.mockRejectedValue(new PersonaMergeInputError("源人物与目标人物不能相同"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/merge", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId,
        targetId
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("源人物与目标人物不能相同");
  });
});
