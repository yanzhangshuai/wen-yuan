import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRelationship,
  patchRelationship
} from "./relationships";

const {
  clientFetchMock,
  clientMutateMock
} = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : clientFetchMock,
  clientMutate: clientMutateMock
}));

describe("relationship service wrappers", () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
    clientMutateMock.mockReset();
  });

  it("posts book-scoped relationship creation payload to the expected endpoint", async () => {
    clientFetchMock.mockResolvedValueOnce({ id: "rel-1" });

    await createRelationship("book/1", {
      chapterId : "chapter-1",
      sourceId  : "persona-1",
      targetId  : "persona-2",
      type      : "师生",
      weight    : 2,
      evidence  : "原文证据",
      confidence: 0.75
    });

    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book%2F1/relationships", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        chapterId : "chapter-1",
        sourceId  : "persona-1",
        targetId  : "persona-2",
        type      : "师生",
        weight    : 2,
        evidence  : "原文证据",
        confidence: 0.75
      })
    });
  });

  it("patches relationship status without requiring a full entity payload", async () => {
    clientMutateMock.mockResolvedValueOnce(undefined);

    await patchRelationship("rel-1", { status: "VERIFIED" });

    expect(clientMutateMock).toHaveBeenCalledWith("/api/relationships/rel-1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ status: "VERIFIED" })
    });
  });
});
