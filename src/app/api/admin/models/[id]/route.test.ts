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

describe("PATCH /api/admin/models/:id", () => {
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

  it("updates model config with 200", async () => {
    updateAdminModelMock.mockResolvedValue({
      id       : validId,
      modelId  : "deepseek-chat",
      baseUrl  : "https://api.deepseek.com",
      isEnabled: true
    });
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          modelId  : "deepseek-chat",
          baseUrl  : "https://api.deepseek.com",
          isEnabled: true
        })
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_UPDATED");
    expect(updateAdminModelMock).toHaveBeenCalledWith(validId, {
      modelId  : "deepseek-chat",
      baseUrl  : "https://api.deepseek.com",
      isEnabled: true
    });
  });

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

  it("returns 400 when modelId is blank", async () => {
    const { PATCH } = await import("./route");

    const response = await PATCH(
      new Request(`http://localhost/api/admin/models/${validId}`, {
        method : "PATCH",
        headers: { "content-type": "application/json" },
        body   : JSON.stringify({
          modelId: "   "
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
