/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 app/ 目录下的 route.ts（或其动态路由变体）测试，验证接口层契约是否稳定。
 * - 在 Next.js 中，route.ts 由文件系统路由自动注册为 HTTP 接口；本测试通过直接调用导出的 HTTP 方法函数复现服务端执行语义。
 *
 * 业务职责：
 * - 约束旧关系直写接口在 T20 后的退役行为，确保管理端不再通过 legacy relationship edit stack 修改最终图谱。
 * - 保护上下游协作边界：管理员仍先经过鉴权，只有通过鉴权后才看到稳定的 410 retired contract。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

describe("PATCH /api/relationships/:id", () => {
  afterEach(() => {
    // route 模块内部没有外部 service mock，这里仅做模块缓存隔离。
    // 这样每个用例都能拿到干净的 route 导出，避免后续退役实现调整时污染断言。
    vi.resetModules();
  });

  it("returns 410 and replacement headers for admins", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.ADMIN
      },
      body: JSON.stringify({
        type      : "师生",
        confidence: 0.9
      })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe("/admin/review");
  });

  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { PATCH } = await import("./route");

    const response = await PATCH(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "PATCH",
      headers: {
        "content-type": "application/json",
        "x-auth-role" : AppRole.VIEWER
      },
      body: JSON.stringify({ type: "师生" })
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
  });
});

describe("DELETE /api/relationships/:id", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("returns 410 and replacement headers for admins", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.ADMIN
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(410);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("LEGACY_REVIEW_STACK_ROUTE_RETIRED");
    expect(payload.error.type).toBe("RouteRetiredError");
    expect(response.headers.get("x-wen-yuan-read-boundary")).toBe("RETIRED_LEGACY_REVIEW_STACK");
    expect(response.headers.get("x-wen-yuan-replacement")).toBe("/admin/review");
  });

  it("returns 403 when viewer requests", async () => {
    const relationshipId = "c3f1f87e-f8e5-4f40-b6c9-eec52f4eaf77";
    const { DELETE } = await import("./route");

    const response = await DELETE(new Request(`http://localhost/api/relationships/${relationshipId}`, {
      method : "DELETE",
      headers: {
        "x-auth-role": AppRole.VIEWER
      }
    }), { params: Promise.resolve({ id: relationshipId }) });

    expect(response.status).toBe(403);
  });
});
