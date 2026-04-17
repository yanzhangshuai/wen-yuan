import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const rejectSuggestionForReviewCenterMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  rejectSuggestionForReviewCenter: rejectSuggestionForReviewCenterMock,
  REVIEW_CENTER_TABS             : ["merge", "impersonation", "done"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 对应 `app/api/admin/books/[id]/merge-suggestions/[suggestionId]/reject/route.ts`。
 * - 拒绝动作仅改状态，不触碰 persona，本测试只覆盖协议层。
 */
describe("POST /api/admin/books/:id/merge-suggestions/:suggestionId/reject", () => {
  const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
  const suggestionId = "f8d2f35e-0fdf-4ef8-848b-77a06c4c1a7b";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    rejectSuggestionForReviewCenterMock.mockReset();
    vi.resetModules();
  });

  it("rejects suggestion", async () => {
    rejectSuggestionForReviewCenterMock.mockResolvedValue({
      id: suggestionId, status: "REJECTED", source: "STAGE_B_AUTO"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/reject", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("ADMIN_BOOK_MERGE_SUGGESTION_REJECTED");
    expect(rejectSuggestionForReviewCenterMock).toHaveBeenCalledWith(bookId, suggestionId);
  });

  it("returns 404 when suggestion does not belong to this book", async () => {
    rejectSuggestionForReviewCenterMock.mockRejectedValue(new MergeSuggestionNotFoundError());
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/reject", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(404);
  });

  it("returns 409 when suggestion already resolved", async () => {
    rejectSuggestionForReviewCenterMock.mockRejectedValue(new MergeSuggestionStateError());
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/reject", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(409);
  });
});
