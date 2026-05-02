import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";

const updateRelationshipEventMock = vi.fn();
const deleteRelationshipEventMock = vi.fn();

vi.mock("@/server/modules/relationships/updateRelationshipEvent", () => ({
  updateRelationshipEvent: updateRelationshipEventMock
}));

vi.mock("@/server/modules/relationships/deleteRelationshipEvent", () => ({
  deleteRelationshipEvent: deleteRelationshipEventMock
}));

describe("PATCH /api/relationship-events/:id", () => {
  afterEach(() => {
    updateRelationshipEventMock.mockReset();
    deleteRelationshipEventMock.mockReset();
  });

  it("updates relationship event fields when admin requests", async () => {
    const eventId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    updateRelationshipEventMock.mockResolvedValue({ id: eventId });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationship-events/${eventId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        summary     : "修订摘要",
        status      : "VERIFIED",
        recordSource: "MANUAL"
      })
    }), { params: Promise.resolve({ id: eventId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_EVENT_UPDATED");
    expect(updateRelationshipEventMock).toHaveBeenCalledWith(eventId, {
      summary     : "修订摘要",
      status      : ProcessingStatus.VERIFIED,
      recordSource: RecordSource.MANUAL
    });
  });

  it("returns 400 for invalid route id", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request("http://localhost/api/relationship-events/bad-id", {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ summary: "修订摘要" })
    }), { params: Promise.resolve({ id: "bad-id" }) });

    expect(response.status).toBe(400);
    expect(updateRelationshipEventMock).not.toHaveBeenCalled();
  });

  it("returns 403 when viewer requests", async () => {
    const eventId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationship-events/${eventId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({ summary: "修订摘要" })
    }), { params: Promise.resolve({ id: eventId }) });

    expect(response.status).toBe(403);
    expect(updateRelationshipEventMock).not.toHaveBeenCalled();
  });
});

describe("DELETE /api/relationship-events/:id", () => {
  afterEach(() => {
    updateRelationshipEventMock.mockReset();
    deleteRelationshipEventMock.mockReset();
  });

  it("soft deletes relationship event when admin requests", async () => {
    const eventId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    deleteRelationshipEventMock.mockResolvedValue({ id: eventId });
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationship-events/${eventId}`, {
      method : "DELETE",
      headers: { "x-auth-role": AppRole.ADMIN }
    }), { params: Promise.resolve({ id: eventId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_EVENT_DELETED");
    expect(deleteRelationshipEventMock).toHaveBeenCalledWith(eventId);
  });

  it("returns 403 when viewer deletes", async () => {
    const eventId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationship-events/${eventId}`, {
      method : "DELETE",
      headers: { "x-auth-role": AppRole.VIEWER }
    }), { params: Promise.resolve({ id: eventId }) });

    expect(response.status).toBe(403);
    expect(deleteRelationshipEventMock).not.toHaveBeenCalled();
  });
});
