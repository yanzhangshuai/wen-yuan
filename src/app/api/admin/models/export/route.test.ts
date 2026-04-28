import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const exportAdminModelsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/models", () => ({
  exportAdminModels: exportAdminModelsMock
}));

describe("GET /api/admin/models/export", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    exportAdminModelsMock.mockReset();
    vi.resetModules();
  });

  it("exports model configs without api keys", async () => {
    exportAdminModelsMock.mockResolvedValue([
      {
        provider : "DeepSeek",
        protocol : "openai-compatible",
        name     : "DeepSeek V4",
        modelId  : "deepseek-chat-v4",
        aliasKey : "deepseek-v4",
        baseUrl  : "https://api.deepseek.com",
        isEnabled: true,
        isDefault: false
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODELS_EXPORTED");
    expect(payload.data[0]).not.toHaveProperty("apiKey");
    expect(exportAdminModelsMock).toHaveBeenCalledOnce();
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(exportAdminModelsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when export service throws", async () => {
    exportAdminModelsMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("模型配置导出失败");
  });
});
