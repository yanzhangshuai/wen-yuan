import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const rejectMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  rejectMergeSuggestion         : rejectMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

/**
 * 文件定位（Next.js 动态管理接口单测）：
 * - 对应 `POST /api/admin/merge-suggestions/[id]/reject`。
 * - T20 后旧建议状态机入口必须统一退役，不能再推进旧 reject 写路径。
 */
describe("POST /api/admin/merge-suggestions/:id/reject", () => {
  beforeEach(() => {
    // 默认管理员角色；非管理员分支一般由统一鉴权测试覆盖。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    rejectMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 retirement payload and never calls the legacy reject service", async () => {
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
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
    expect(rejectMergeSuggestionMock).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer and never calls the legacy reject service", async () => {
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
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
    expect(rejectMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
