import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const acceptMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}
class PersonaMergeConflictError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  acceptMergeSuggestion         : acceptMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
}));

/**
 * 文件定位（Next.js 动态路由接口单测）：
 * - 对应 `app/api/admin/merge-suggestions/[id]/accept/route.ts`。
 * - T20 后该路径只保留为旧审核栈退役提示，不能再触发任何合并写操作。
 */
describe("POST /api/admin/merge-suggestions/:id/accept", () => {
  beforeEach(() => {
    // 默认使用管理员角色，确保主场景能够触达 accept 逻辑。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    acceptMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 retirement payload and never calls the legacy accept service", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe("/admin/review");
    expect(acceptMergeSuggestionMock).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer and still never calls the legacy accept service", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(acceptMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
