import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listAdminModelsMock = vi.fn();
const updateAdminModelMock = vi.fn();
const setDefaultAdminModelMock = vi.fn();
const testAdminModelConnectionMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/models", () => ({
  listAdminModels         : listAdminModelsMock,
  updateAdminModel        : updateAdminModelMock,
  setDefaultAdminModel    : setDefaultAdminModelMock,
  testAdminModelConnection: testAdminModelConnectionMock
}));

describe("POST /api/admin/models/:id/test", () => {
  const validId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listAdminModelsMock.mockReset();
    updateAdminModelMock.mockReset();
    setDefaultAdminModelMock.mockReset();
    testAdminModelConnectionMock.mockReset();
    vi.resetModules();
  });

  it("tests model connectivity with 200", async () => {
    testAdminModelConnectionMock.mockResolvedValue({
      success  : true,
      latencyMs: 128,
      detail   : "连接成功"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/test`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_CONNECTION_TESTED");
    expect(testAdminModelConnectionMock).toHaveBeenCalledWith(validId);
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/test`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(testAdminModelConnectionMock).not.toHaveBeenCalled();
  });

  it("returns 400 when id is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models/invalid/test", {
        method: "POST"
      }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("模型 ID 不合法");
    expect(testAdminModelConnectionMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    testAdminModelConnectionMock.mockRejectedValue(new Error("network down"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/test`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("模型连通性测试失败");
  });

  it("returns whitelist rejection detail when connectivity target is not allowed", async () => {
    testAdminModelConnectionMock.mockRejectedValue(new Error("连通性测试地址不在白名单内"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/test`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.error?.detail).toBe("连通性测试地址不在白名单内");
  });
});
