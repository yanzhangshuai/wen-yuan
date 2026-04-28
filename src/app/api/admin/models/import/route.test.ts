import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const importAdminModelsMock = vi.fn();

class MockModelConfigurationError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400
  ) {
    super(message);
    this.name = "ModelConfigurationError";
  }
}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/models", () => ({
  ModelConfigurationError: MockModelConfigurationError,
  importAdminModels      : importAdminModelsMock
}));

describe("POST /api/admin/models/import", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    importAdminModelsMock.mockReset();
    vi.resetModules();
  });

  it("imports model configs with 200", async () => {
    importAdminModelsMock.mockResolvedValue({
      created: 1,
      updated: 0,
      skipped: 0
    });
    const payload = {
      models: [
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
      ]
    };
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models/import", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify(payload)
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.success).toBe(true);
    expect(body.code).toBe("ADMIN_MODELS_IMPORTED");
    expect(importAdminModelsMock).toHaveBeenCalledWith(payload);
  });

  it("maps import schema errors to 400", async () => {
    importAdminModelsMock.mockRejectedValue(new z.ZodError([
      {
        code   : "custom",
        path   : ["models", 0, "baseUrl"],
        message: "BaseURL 格式不合法"
      }
    ]));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models/import", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({ models: [] })
    }));

    expect(response.status).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("COMMON_BAD_REQUEST");
    expect(body.error?.detail).toBe("BaseURL 格式不合法");
  });

  it("maps duplicate import errors", async () => {
    importAdminModelsMock.mockRejectedValue(new MockModelConfigurationError(
      "ADMIN_MODEL_ALIAS_DUPLICATE",
      "Alias Key 重复",
      409
    ));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models/import", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({ models: [] })
    }));

    expect(response.status).toBe(409);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("ADMIN_MODEL_ALIAS_DUPLICATE");
  });

  it("returns 403 when auth guard fails before import", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models/import", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({ models: [] })
    }));

    expect(response.status).toBe(403);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("AUTH_FORBIDDEN");
    expect(importAdminModelsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when import service throws unexpectedly", async () => {
    importAdminModelsMock.mockRejectedValue(new Error("import failed"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models/import", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({ models: [] })
    }));

    expect(response.status).toBe(500);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.code).toBe("COMMON_INTERNAL_ERROR");
    expect(body.message).toBe("模型配置导入失败");
  });
});
