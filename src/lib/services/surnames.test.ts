import { beforeEach, describe, expect, it, vi } from "vitest";

import { batchSurnameAction } from "@/lib/services/surnames";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("surnames service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("posts batch surname actions and returns affected count", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ count: 2 });

    await expect(batchSurnameAction({
      action    : "changeBookType",
      ids       : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      bookTypeId: null
    })).resolves.toEqual({ count: 2 });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/knowledge/surnames/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        action    : "changeBookType",
        ids       : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        bookTypeId: null
      })
    });
    expect(hoisted.clientMutateMock).not.toHaveBeenCalled();
  });
});
