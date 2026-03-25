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

describe("POST /api/admin/models/:id/set-default", () => {
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

  it("sets default model with 200", async () => {
    setDefaultAdminModelMock.mockResolvedValue({
      id       : validId,
      isDefault: true
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/set-default`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_DEFAULT_SET");
    expect(setDefaultAdminModelMock).toHaveBeenCalledWith(validId);
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/set-default`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(setDefaultAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 400 when id is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/models/invalid/set-default", {
        method: "POST"
      }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("模型 ID 不合法");
    expect(setDefaultAdminModelMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    setDefaultAdminModelMock.mockRejectedValue(new Error("update failed"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request(`http://localhost/api/admin/models/${validId}/set-default`, {
        method: "POST"
      }),
      { params: Promise.resolve({ id: validId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("默认模型设置失败");
  });
});
