import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const acceptSuggestionForReviewCenterMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}
class PersonaMergeConflictError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  acceptSuggestionForReviewCenter: acceptSuggestionForReviewCenterMock,
  REVIEW_CENTER_TABS             : ["merge", "impersonation", "done"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
}));

/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 对应 `app/api/admin/books/[id]/merge-suggestions/[suggestionId]/accept/route.ts`。
 * - T20 后书籍级旧 accept 入口也必须统一退役。
 */
describe("POST /api/admin/books/:id/merge-suggestions/:suggestionId/accept", () => {
  const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
  const suggestionId = "f8d2f35e-0fdf-4ef8-848b-77a06c4c1a7b";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    acceptSuggestionForReviewCenterMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 retirement payload and never calls the legacy review-center accept service", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe(`/admin/review/${bookId}`);
    expect(acceptSuggestionForReviewCenterMock).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(403);
    expect(acceptSuggestionForReviewCenterMock).not.toHaveBeenCalled();
  });
});
