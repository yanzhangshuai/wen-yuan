import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createRelationshipEvent,
  deleteRelationshipEvent,
  patchRelationshipEvent
} from "./relationship-events";

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

describe("relationship event service wrappers", () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
    clientMutateMock.mockReset();
  });

  it("posts event creation payload to the relationship scoped endpoint", async () => {
    clientFetchMock.mockResolvedValueOnce({ id: "event-1" });

    await createRelationshipEvent("rel/1", {
      chapterId   : "chapter-1",
      summary     : "张三提携李四",
      attitudeTags: ["资助"]
    });

    expect(clientFetchMock).toHaveBeenCalledWith("/api/relationships/rel%2F1/events", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        chapterId   : "chapter-1",
        summary     : "张三提携李四",
        attitudeTags: ["资助"]
      })
    });
  });

  it("patches event fields through the item endpoint", async () => {
    clientMutateMock.mockResolvedValueOnce(undefined);

    await patchRelationshipEvent("event/1", { status: "VERIFIED" });

    expect(clientMutateMock).toHaveBeenCalledWith("/api/relationship-events/event%2F1", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ status: "VERIFIED" })
    });
  });

  it("deletes events through the item endpoint", async () => {
    clientMutateMock.mockResolvedValueOnce(undefined);

    await deleteRelationshipEvent("event/1");

    expect(clientMutateMock).toHaveBeenCalledWith("/api/relationship-events/event%2F1", {
      method: "DELETE"
    });
  });
});
