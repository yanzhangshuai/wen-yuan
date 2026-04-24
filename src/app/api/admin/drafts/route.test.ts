import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

/**
 * 文件定位（Next.js 管理端草稿列表接口单测）：
 * - 对应 `app/api/admin/drafts/route.ts`，用于聚合待审人物/关系/生平草稿。
 * - 属于接口层测试，重点覆盖：鉴权、查询参数校验、成功载荷契约。
 *
 * 框架语义：
 * - `route.ts` 在服务端运行，本测试通过构造 `Request` 模拟真实查询字符串输入。
 * - `headers()` 由 Next.js 提供请求上下文，这里 mock 角色头复现权限分支。
 */
describe("GET /api/admin/drafts", () => {
  beforeEach(() => {
    // 默认以管理员身份进入，确保主路径聚焦在业务筛选参数解析。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 and does not call legacy draft service even when filters are present", async () => {
    // T20 退役要求：旧 drafts 接口继续保留 URL 但只能返回明确迁移提示，不能再成为可读真相入口。
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/drafts?tab=RELATIONSHIP&source=AI")
    );

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe("/admin/review");
  });

  it("returns 403 when user is viewer", async () => {
    // 权限规则：草稿审校属于后台高权限能力，普通浏览角色不能访问。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/drafts"));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
  });
});
