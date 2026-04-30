import { beforeEach, describe, expect, it, vi } from "vitest";

import { batchRelationshipTypeAction } from "@/lib/services/relationship-types";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("relationship-types service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("posts relationship type batch actions and returns affected count", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ count: 2 });

    await expect(batchRelationshipTypeAction({
      action: "changeGroup",
      ids   : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      group : "姻亲"
    })).resolves.toEqual({ count: 2 });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        action: "changeGroup",
        ids   : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        group : "姻亲"
      })
    });
    expect(hoisted.clientMutateMock).not.toHaveBeenCalled();
  });
});
