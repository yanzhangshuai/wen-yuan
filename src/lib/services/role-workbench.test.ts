import { beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("role workbench chapter event service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("uses the role workbench API path for chapter event operations", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ summary: {}, chapters: [] });
    hoisted.clientFetchMock.mockResolvedValueOnce([]);
    hoisted.clientFetchMock.mockResolvedValueOnce({ id: "event-1" });
    hoisted.clientFetchMock.mockResolvedValueOnce({ id: "event-1" });
    hoisted.clientMutateMock.mockResolvedValue(undefined);

    const {
      createChapterEvent,
      deleteChapterEvent,
      fetchChapterEventChapters,
      fetchChapterEvents,
      markChapterEventsVerified,
      updateChapterEvent
    } = await import("./role-workbench");

    await fetchChapterEventChapters("book-1");
    await fetchChapterEvents("book-1", "chapter-1", { status: "PENDING", source: "AI" });
    await createChapterEvent("book-1", {
      personaId: "persona-1",
      chapterId: "chapter-1",
      event    : "初次登场"
    });
    await updateChapterEvent("book-1", "event-1", { status: "VERIFIED" });
    await deleteChapterEvent("book-1", "event-1");
    await markChapterEventsVerified("book-1", "chapter-1");

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/role-workbench/books/book-1/chapter-events"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/role-workbench/books/book-1/chapter-events?chapterId=chapter-1&status=PENDING&source=AI"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/admin/role-workbench/books/book-1/chapter-events",
      expect.objectContaining({ method: "POST" })
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/admin/role-workbench/books/book-1/chapter-events/event-1",
      expect.objectContaining({ method: "PATCH" })
    );
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/role-workbench/books/book-1/chapter-events/event-1",
      { method: "DELETE" }
    );
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/role-workbench/books/book-1/chapter-events/verify",
      expect.objectContaining({ method: "POST" })
    );
  });
});
