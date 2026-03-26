import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const updateGraphLayoutMock = vi.fn();

vi.mock("@/server/modules/graph/updateGraphLayout", () => ({
  updateGraphLayout: updateGraphLayoutMock
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

describe("PATCH /api/graphs/:id/layout", () => {
  afterEach(() => {
    updateGraphLayoutMock.mockReset();
  });

  it("updates graph layout when admin requests", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    updateGraphLayoutMock.mockResolvedValue({
      graphId,
      savedCount       : 2,
      createdCount     : 1,
      updatedCount     : 1,
      ignoredPersonaIds: [],
      updatedAt        : "2026-03-25T00:00:00.000Z"
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        nodes: [
          { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 },
          { personaId: "45236d8a-a87e-4611-ad7c-dcb75887243f", x: 60, y: 90 }
        ]
      })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("GRAPH_LAYOUT_UPDATED");
    expect(updateGraphLayoutMock).toHaveBeenCalledWith({
      graphId,
      nodes: [
        { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 },
        { personaId: "45236d8a-a87e-4611-ad7c-dcb75887243f", x: 60, y: 90 }
      ]
    });
  });

  it("returns 403 when viewer requests", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({
        nodes: [
          { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 }
        ]
      })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(403);
    expect(updateGraphLayoutMock).not.toHaveBeenCalled();
  });

  it("returns 400 for invalid payload", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({ nodes: [] })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(400);
    expect(updateGraphLayoutMock).not.toHaveBeenCalled();
  });

  it("returns 404 when graph is missing", async () => {
    const graphId = "2e577160-fbc5-4ca3-8bf6-58b2ae7ab9c7";
    const { BookNotFoundError } = await import("@/server/modules/books/errors");
    updateGraphLayoutMock.mockRejectedValue(new BookNotFoundError(graphId));
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/graphs/${graphId}/layout`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        nodes: [
          { personaId: "4d6f2901-a3c5-4f58-bf09-bf0eb27e20f2", x: 120, y: 240 }
        ]
      })
    }), { params: Promise.resolve({ id: graphId }) });

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
