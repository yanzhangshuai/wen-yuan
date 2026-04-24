import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const deferMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  deferMergeSuggestion          : deferMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

/**
 * 文件定位（Next.js 动态管理接口单测）：
 * - 对应 `POST /api/admin/merge-suggestions/[id]/defer`。
 * - T20 后旧 defer 路径也必须统一退役，避免旧审核栈残留写口。
 */
describe("POST /api/admin/merge-suggestions/:id/defer", () => {
  beforeEach(() => {
    // 默认管理员身份，确保主路径可触达 defer 业务逻辑。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    deferMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 retirement payload and never calls the legacy defer service", async () => {
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
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
    expect(deferMergeSuggestionMock).not.toHaveBeenCalled();
  });

  it("returns 403 for viewer and never calls the legacy defer service", async () => {
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
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
    expect(deferMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
