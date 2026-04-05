import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listAdminDraftsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/listDrafts", () => ({
  REVIEW_DRAFT_TAB_VALUES: ["PERSONA", "RELATIONSHIP", "BIOGRAPHY"] as const,
  listAdminDrafts        : listAdminDraftsMock
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
    listAdminDraftsMock.mockReset();
    vi.resetModules();
  });

  it("returns admin drafts with filter", async () => {
    // 成功分支：校验 tab/source 过滤参数能正确传入服务层，影响后台审校工作台的数据范围。
    listAdminDraftsMock.mockResolvedValue({
      summary: {
        persona     : 1,
        relationship: 2,
        biography   : 3,
        total       : 6
      },
      personas        : [],
      relationships   : [],
      biographyRecords: []
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/drafts?tab=RELATIONSHIP&source=AI")
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_DRAFTS_LISTED");
    expect(listAdminDraftsMock).toHaveBeenCalledWith({
      tab   : "RELATIONSHIP",
      source: "AI"
    });
  });

  it("returns 400 when query is invalid", async () => {
    // 防御分支：非法 tab 在入口拒绝，避免出现“服务层自由兜底”导致行为不一致。
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/drafts?tab=INVALID")
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(listAdminDraftsMock).not.toHaveBeenCalled();
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
