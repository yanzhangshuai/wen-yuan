import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listMergeSuggestionsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  listMergeSuggestions          : listMergeSuggestionsMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const
}));

/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 对应 `app/api/admin/merge-suggestions/route.ts`。
 * - T20 后该接口属于旧审核栈，只保留显式退役边界，不再返回历史建议数据。
 */
describe("GET /api/admin/merge-suggestions", () => {
  beforeEach(() => {
    // 默认场景为管理员，便于聚焦业务成功路径；非管理员分支在独立用例覆盖。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listMergeSuggestionsMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 retirement payload and never calls the legacy merge suggestion service", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions?status=PENDING"));

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe("/admin/review");
    expect(listMergeSuggestionsMock).not.toHaveBeenCalled();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions"));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(listMergeSuggestionsMock).not.toHaveBeenCalled();
  });
});
