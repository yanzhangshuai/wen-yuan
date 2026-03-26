import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, ProcessingStatus } from "@/generated/prisma/enums";

const updateRelationshipMock = vi.fn();
const deleteRelationshipMock = vi.fn();

vi.mock("@/server/modules/relationships/updateRelationship", () => ({
  updateRelationship: updateRelationshipMock
}));

vi.mock("@/server/modules/relationships/deleteRelationship", () => ({
  deleteRelationship: deleteRelationshipMock
}));

vi.mock("@/server/modules/relationships/errors", () => {
  class RelationshipNotFoundError extends Error {
    readonly relationshipId: string;

    constructor(relationshipId: string) {
      super(`Relationship not found: ${relationshipId}`);
      this.relationshipId = relationshipId;
    }
  }

  class RelationshipInputError extends Error {
    constructor(message: string) {
      super(message);
    }
  }

  return {
    RelationshipNotFoundError,
    RelationshipInputError
  };
});

describe("PATCH /api/relationships/:id", () => {
  afterEach(() => {
    updateRelationshipMock.mockReset();
    deleteRelationshipMock.mockReset();
  });

  it("updates relationship when admin requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    updateRelationshipMock.mockResolvedValue({
      id         : relationshipId,
      chapterId  : "chapter-1",
      sourceId   : "persona-1",
      targetId   : "persona-2",
      type       : "师生",
      weight     : 0.8,
      description: null,
      evidence   : null,
      confidence : 0.9,
      status     : ProcessingStatus.VERIFIED,
      updatedAt  : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        type      : "师生",
        confidence: 0.9
      })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_UPDATED");
    expect(updateRelationshipMock).toHaveBeenCalledWith(relationshipId, {
      type      : "师生",
      confidence: 0.9
    });
  });

  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
    expect(updateRelationshipMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({})
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(400);
    expect(updateRelationshipMock).not.toHaveBeenCalled();
  });

  it("returns 404 when relationship missing", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { RelationshipNotFoundError } = await import("@/server/modules/relationships/errors");
    updateRelationshipMock.mockRejectedValue(new RelationshipNotFoundError(relationshipId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});

describe("DELETE /api/relationships/:id", () => {
  afterEach(() => {
    updateRelationshipMock.mockReset();
    deleteRelationshipMock.mockReset();
  });

  it("soft deletes relationship when admin requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    deleteRelationshipMock.mockResolvedValue({
      id       : relationshipId,
      status   : ProcessingStatus.REJECTED,
      deletedAt: "2026-03-25T00:00:00.000Z"
    });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_DELETED");
    expect(deleteRelationshipMock).toHaveBeenCalledWith(relationshipId);
  });

  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.VIEWER
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
    expect(deleteRelationshipMock).not.toHaveBeenCalled();
  });

  it("returns 404 when relationship missing", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { RelationshipNotFoundError } = await import("@/server/modules/relationships/errors");
    deleteRelationshipMock.mockRejectedValue(new RelationshipNotFoundError(relationshipId));
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
