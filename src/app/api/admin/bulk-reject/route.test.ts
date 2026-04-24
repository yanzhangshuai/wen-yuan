import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

/**
 * 文件定位（Next.js 管理端批量驳回接口单测）：
 * - 对应 `POST /api/admin/bulk-reject`，用于一次性驳回多条草稿。
 * - 该接口处于审校工作流关键路径，直接影响后台批量操作效率。
 *
 * Next.js 语义说明：
 * - `route.ts` 运行于服务端；本测试通过构造 `Request` 模拟 JSON body 与权限头。
 * - 鉴权仍通过 `next/headers` 读取请求上下文，这里使用 mock 控制角色分支。
 */
describe("POST /api/admin/bulk-reject", () => {
  beforeEach(() => {
    // 默认管理员角色，优先覆盖主业务成功路径。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    vi.resetModules();
  });

  it("returns 410 and replacement headers for admins", async () => {
    // T20 退役要求：旧 bulk reject 写路径不再接受旧 review-panel 调用，管理员也只收到迁移提示。
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-reject", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe("/admin/review");
  });

  it("returns 403 when viewer calls the API", async () => {
    // 权限边界：VIEWER 不得执行批量驳回，防止越权修改审校状态。
    headersMock.mockResolvedValueOnce(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-reject", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(403);
  });
});
