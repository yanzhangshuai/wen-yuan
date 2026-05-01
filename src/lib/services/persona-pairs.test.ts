import { beforeEach, describe, expect, it, vi } from "vitest";

import { fetchPersonaPair } from "./persona-pairs";

const { clientFetchMock } = vi.hoisted(() => ({
  clientFetchMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch: clientFetchMock
}));

describe("persona pair service wrapper", () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
  });

  it("fetches pair aggregation from the encoded persona-pairs endpoint", async () => {
    clientFetchMock.mockResolvedValueOnce({
      bookId       : "book/1",
      aId          : "persona a",
      bId          : "persona/b",
      personas     : [],
      relationships: []
    });

    await expect(fetchPersonaPair("book/1", "persona a", "persona/b")).resolves.toEqual({
      bookId       : "book/1",
      aId          : "persona a",
      bId          : "persona/b",
      personas     : [],
      relationships: []
    });
    expect(clientFetchMock).toHaveBeenCalledWith("/api/persona-pairs/book%2F1/persona%20a/persona%2Fb");
  });
});
