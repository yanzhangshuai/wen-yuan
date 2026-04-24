/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 app/ 目录下的 route.ts（或其动态路由变体）测试，验证接口层契约是否稳定。
 * - 在 Next.js 中，route.ts 由文件系统路由自动注册为 HTTP 接口；本测试通过直接调用导出的 HTTP 方法函数复现服务端执行语义。
 *
 * 业务职责：
 * - 约束请求参数校验、鉴权分支、服务层调用参数、错误码映射、统一响应包结构。
 * - 保护上下游协作边界：上游是浏览器/管理端请求，下游是各领域 service 与数据访问层。
 *
 * 维护注意：
 * - 这是接口契约测试，断言字段和状态码属于外部约定，不能随意改动。
 * - 若未来调整路由/错误码，请同步更新前端调用方与文档，否则会造成线上联调回归。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/admin/bulk-verify", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 410 and replacement headers for admins", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify", {
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when viewer calls the API", async () => {
    headersMock.mockResolvedValueOnce(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify", {
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when middleware headers are missing", async () => {
    headersMock.mockResolvedValueOnce(new Headers());
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify?bookId=book-1", {
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
