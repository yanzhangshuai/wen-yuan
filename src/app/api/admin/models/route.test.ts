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

describe("GET /api/admin/models", () => {
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

  it("returns admin models list with 200", async () => {
    listAdminModelsMock.mockResolvedValue([
      {
        id       : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39",
        name     : "DeepSeek V3",
        provider : "deepseek",
        modelId  : "deepseek-chat",
        isEnabled: true,
        isDefault: true
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODELS_LISTED");
    expect(payload.data).toHaveLength(1);
    expect(listAdminModelsMock).toHaveBeenCalledOnce();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(listAdminModelsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    listAdminModelsMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("模型列表获取失败");
  });
});
