import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listBookSuggestionsByTabMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  listBookSuggestionsByTab: listBookSuggestionsByTabMock,
  REVIEW_CENTER_TABS      : ["merge", "impersonation", "done"] as const
}));

/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 对应 `app/api/admin/books/[id]/merge-suggestions/route.ts`。
 * - T20 后旧 review-center 列表接口只保留退役提示，避免继续读旧建议栈。
 */
describe("GET /api/admin/books/:id/merge-suggestions", () => {
  const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listBookSuggestionsByTabMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 retirement payload and never calls the legacy review-center list service", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${bookId}/merge-suggestions?tab=merge&page=1`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe(`/admin/review/${bookId}`);
    expect(listBookSuggestionsByTabMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth role is viewer", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${bookId}/merge-suggestions?tab=merge`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(listBookSuggestionsByTabMock).not.toHaveBeenCalled();
  });
});
