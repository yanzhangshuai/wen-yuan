import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createBiography,
  deleteBiography,
  patchBiography
} from "./biography";

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

describe("biography service wrappers", () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
    clientMutateMock.mockReset();
  });

  it("posts persona-scoped biography creation payload to the expected endpoint", async () => {
    clientFetchMock.mockResolvedValueOnce({ id: "bio-1" });

    await createBiography("persona/1", {
      chapterId: "chapter-1",
      category : "EVENT",
      title    : "中举",
      location : null,
      event    : "范进中举。"
    });

    expect(clientFetchMock).toHaveBeenCalledWith("/api/personas/persona%2F1/biography", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        chapterId: "chapter-1",
        category : "EVENT",
        title    : "中举",
        location : null,
        event    : "范进中举。"
      })
    });
  });

  it("patches biography status without requiring a full entity payload", async () => {
    clientMutateMock.mockResolvedValueOnce(undefined);

    await patchBiography("bio-1", { status: "REJECTED" });

    expect(clientMutateMock).toHaveBeenCalledWith("/api/biography/bio-1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ status: "REJECTED" })
    });
  });

  it("deletes one biography record through the expected endpoint", async () => {
    clientMutateMock.mockResolvedValueOnce(undefined);

    await deleteBiography("bio/1");

    expect(clientMutateMock).toHaveBeenCalledWith("/api/biography/bio%2F1", {
      method: "DELETE"
    });
  });
});
