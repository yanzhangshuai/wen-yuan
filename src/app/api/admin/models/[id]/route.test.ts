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
const listAdminModelsMock = vi.fn();
const updateAdminModelMock = vi.fn();
const deleteAdminModelMock = vi.fn();
const setDefaultAdminModelMock = vi.fn();
const testAdminModelConnectionMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/models", () => ({
  listAdminModels         : listAdminModelsMock,
  updateAdminModel        : updateAdminModelMock,
  deleteAdminModel        : deleteAdminModelMock,
  setDefaultAdminModel    : setDefaultAdminModelMock,
  testAdminModelConnection: testAdminModelConnectionMock
}));

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("PATCH /api/admin/models/:id", () => {
  const validId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listAdminModelsMock.mockReset();
    updateAdminModelMock.mockReset();
    deleteAdminModelMock.mockReset();
    setDefaultAdminModelMock.mockReset();
    testAdminModelConnectionMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("updates model config with 200", async () => {
    updateAdminModelMock.mockResolvedValue({
      id             : validId,
      providerModelId: "deepseek-v3.2",
      baseUrl        : "https://api.deepseek.com",
      isEnabled      : true
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          providerModelId: "deepseek-v3.2",
          baseUrl        : "https://api.deepseek.com",
          isEnabled      : true
        })
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_UPDATED");
    expect(updateAdminModelMock).toHaveBeenCalledWith(validId, {
      providerModelId: "deepseek-v3.2",
      baseUrl        : "https://api.deepseek.com",
      isEnabled      : true
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ isEnabled: true })
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(updateAdminModelMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when params or body are invalid", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request("http://localhost/api/admin/models/invalid", {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ baseUrl: "not-a-url" })
      }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("模型 ID 不合法");
    expect(updateAdminModelMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({})
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("至少提供一个可更新字段");
    expect(updateAdminModelMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when providerModelId is blank", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          providerModelId: "   "
        })
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("模型标识不能为空");
    expect(updateAdminModelMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 500 when service throws", async () => {
    updateAdminModelMock.mockRejectedValue(new Error("write failed"));
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({ isEnabled: true })
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("模型配置更新失败");
  });
});

describe("DELETE /api/admin/models/:id", () => {
  const validId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    deleteAdminModelMock.mockReset();
    vi.resetModules();
  });

  it("deletes a model and returns 200 with ADMIN_MODEL_DELETED", async () => {
    deleteAdminModelMock.mockResolvedValue(undefined);
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request(`http://localhost/api/admin/models/${validId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_DELETED");
    expect(deleteAdminModelMock).toHaveBeenCalledWith(validId);
  });

  it("returns 403 when not admin", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request(`http://localhost/api/admin/models/${validId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(403);
    expect(deleteAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 400 when id is not a valid UUID", async () => {
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request("http://localhost/api/admin/models/invalid", { method: "DELETE" }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.error?.detail).toBe("模型 ID 不合法");
    expect(deleteAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    deleteAdminModelMock.mockRejectedValue(new Error("db delete failed"));
    const { DELETE } = await import("./route");

    const response = await DELETE(
      new Request(`http://localhost/api/admin/models/${validId}`, { method: "DELETE" }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.message).toBe("模型删除失败");
  });
});
