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
 * - 对应 `app/api/admin/books/[id]/merge-suggestions/route.ts`；
 * - 验证书籍审核中心列表接口的鉴权、Tab 参数校验、分页 meta 回包契约。
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

  it("returns paginated list with tab=merge", async () => {
    // 成功分支：验证 Tab 参数与分页被正确透传到服务层。
    listBookSuggestionsByTabMock.mockResolvedValue({
      items: [{ id: "s-1", status: "PENDING", source: "STAGE_B_AUTO" }],
      total: 1
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${bookId}/merge-suggestions?tab=merge&page=1`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_BOOK_MERGE_SUGGESTIONS_LISTED");
    expect(payload.meta.pagination).toEqual({ page: 1, pageSize: 20, total: 1 });
    expect(listBookSuggestionsByTabMock).toHaveBeenCalledWith({
      bookId,
      tab     : "merge",
      page    : 1,
      pageSize: 20
    });
  });

  it("defaults tab to 'merge' when query missing", async () => {
    listBookSuggestionsByTabMock.mockResolvedValue({ items: [], total: 0 });
    const { GET } = await import("./route");

    await GET(
      new Request(`http://localhost/api/admin/books/${bookId}/merge-suggestions`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(listBookSuggestionsByTabMock).toHaveBeenCalledWith(expect.objectContaining({ tab: "merge" }));
  });

  it("returns 400 when tab is invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${bookId}/merge-suggestions?tab=invalid`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(listBookSuggestionsByTabMock).not.toHaveBeenCalled();
  });

  it("returns 400 when bookId is not uuid", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/books/not-uuid/merge-suggestions"),
      { params: Promise.resolve({ id: "not-uuid" }) }
    );

    expect(response.status).toBe(400);
    expect(listBookSuggestionsByTabMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth role is viewer", async () => {
    // 权限边界：审核中心数据暴露规则命中点，viewer 禁止访问。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(
      new Request(`http://localhost/api/admin/books/${bookId}/merge-suggestions?tab=merge`),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe("AUTH_FORBIDDEN");
  });
});
