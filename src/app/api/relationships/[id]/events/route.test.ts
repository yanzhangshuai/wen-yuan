import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const createRelationshipEventMock = vi.fn();

vi.mock("@/server/modules/relationships/createRelationshipEvent", () => ({
  createRelationshipEvent: createRelationshipEventMock
}));

describe("POST /api/relationships/:id/events", () => {
  afterEach(() => {
    createRelationshipEventMock.mockReset();
  });

  it("creates a relationship event when admin requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    createRelationshipEventMock.mockResolvedValue({ id: "event-1" });
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/relationships/${relationshipId}/events`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        chapterId   : "11111111-1111-4111-8111-111111111111",
        summary     : "张三提携李四",
        evidence    : "原文证据",
        attitudeTags: ["资助"],
        paraIndex   : 12,
        confidence  : 0.8
      })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("RELATIONSHIP_EVENT_CREATED");
    expect(createRelationshipEventMock).toHaveBeenCalledWith(relationshipId, {
      chapterId   : "11111111-1111-4111-8111-111111111111",
      summary     : "张三提携李四",
      evidence    : "原文证据",
      attitudeTags: ["资助"],
      paraIndex   : 12,
      confidence  : 0.8
    });
  });

  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/relationships/${relationshipId}/events`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        chapterId: "11111111-1111-4111-8111-111111111111",
        summary  : "张三提携李四"
      })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
    expect(createRelationshipEventMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid body", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { POST } = await import("./route");

    const response = await POST(new Request(`http://localhost/api/relationships/${relationshipId}/events`, {
      method : "POST",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ summary: "" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(400);
    expect(createRelationshipEventMock).not.toHaveBeenCalled();
  });
});
