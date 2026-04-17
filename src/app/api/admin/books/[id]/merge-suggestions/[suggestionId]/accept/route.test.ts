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
 * - 对应 `app/api/admin/books/[id]/merge-suggestions/[suggestionId]/accept/route.ts`；
 * - 验证书籍级接受合并建议 API 的分派契约与错误映射。
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

  it("accepts MERGE suggestion and returns ACCEPTED payload", async () => {
    // 成功分支：STAGE_B_AUTO / STAGE_C_FEEDBACK 走全量合并事务后标 ACCEPTED。
    acceptSuggestionForReviewCenterMock.mockResolvedValue({
      id    : suggestionId,
      status: "ACCEPTED",
      source: "STAGE_B_AUTO"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.code).toBe("ADMIN_BOOK_MERGE_SUGGESTION_ACCEPTED");
    expect(acceptSuggestionForReviewCenterMock).toHaveBeenCalledWith(bookId, suggestionId);
  });

  it("accepts IMPERSONATION suggestion without mutation (dispatched by service)", async () => {
    // 冒名候选分支：service 内部不会迁移 persona，这里只验证 route 层转发 + 返回 source。
    acceptSuggestionForReviewCenterMock.mockResolvedValue({
      id    : suggestionId,
      status: "ACCEPTED",
      source: "STAGE_B5_TEMPORAL"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.data.source).toBe("STAGE_B5_TEMPORAL");
  });

  it("maps MergeSuggestionNotFoundError to 404 (cross-book防越权)", async () => {
    acceptSuggestionForReviewCenterMock.mockRejectedValue(
      new MergeSuggestionNotFoundError("not found")
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(404);
  });

  it("maps state/persona conflict to 409", async () => {
    acceptSuggestionForReviewCenterMock.mockRejectedValue(
      new MergeSuggestionStateError()
    );
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId }) }
    );

    expect(response.status).toBe(409);
  });

  it("returns 400 when suggestionId is not uuid", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/accept", { method: "POST" }),
      { params: Promise.resolve({ id: bookId, suggestionId: "invalid" }) }
    );

    expect(response.status).toBe(400);
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
