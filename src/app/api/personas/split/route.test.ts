/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 验证 POST /api/personas/split 的鉴权、参数校验与错误映射契约。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const splitPersonaMock = vi.fn();

vi.mock("@/server/modules/personas/splitPersona", () => {
  class PersonaNotFoundError extends Error {
    readonly personaId: string;

    constructor(personaId: string) {
      super(`Persona not found: ${personaId}`);
      this.personaId = personaId;
    }
  }

  class PersonaSplitInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    splitPersona: splitPersonaMock,
    PersonaNotFoundError,
    PersonaSplitInputError
  };
});

describe("POST /api/personas/split", () => {
  afterEach(() => {
    splitPersonaMock.mockReset();
    vi.resetModules();
  });

  it("splits persona and returns 200", async () => {
    splitPersonaMock.mockResolvedValue({
      sourceId                : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
      createdPersonaId        : "2fd91a82-0492-4c9a-ae0d-f3376517e578",
      bookId                  : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
      chapterNos              : [1, 2],
      redirectedRelationships : 1,
      rejectedRelationships   : 0,
      redirectedBiographyCount: 3,
      redirectedMentionCount  : 4
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/split", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId  : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        bookId    : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
        chapterNos: [1, 2],
        name      : "马二先生"
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("PERSONA_SPLIT");
    expect(splitPersonaMock).toHaveBeenCalledWith({
      sourceId  : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
      bookId    : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
      chapterNos: [1, 2],
      name      : "马二先生"
    });
  });

  it("returns 403 for viewer", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/split", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        sourceId  : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        bookId    : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
        chapterNos: [1],
        name      : "马二先生"
      })
    }));

    expect(response.status).toBe(403);
    expect(splitPersonaMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/split", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId  : "invalid-id",
        bookId    : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
        chapterNos: [],
        name      : ""
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(splitPersonaMock).not.toHaveBeenCalled();
  });

  it("maps PersonaNotFoundError to 404", async () => {
    const sourceId = "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8";
    const { PersonaNotFoundError } = await import("@/server/modules/personas/splitPersona");
    splitPersonaMock.mockRejectedValue(new PersonaNotFoundError(sourceId));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/split", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId,
        bookId    : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
        chapterNos: [1],
        name      : "马二先生"
      })
    }));

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("maps PersonaSplitInputError to 400", async () => {
    const { PersonaSplitInputError } = await import("@/server/modules/personas/splitPersona");
    splitPersonaMock.mockRejectedValue(new PersonaSplitInputError("至少选择一个有效章节"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/personas/split", {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        sourceId  : "6235de9d-f4c3-4b1d-bc90-03b8f09e4fd8",
        bookId    : "f2a6974f-ecf3-4b47-9c91-cfc1112ee5f2",
        chapterNos: [1],
        name      : "马二先生"
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("至少选择一个有效章节");
  });
});
