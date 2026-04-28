import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const createAdminModelMock = vi.fn();
const listAdminModelsMock = vi.fn();
const updateAdminModelMock = vi.fn();
const setDefaultAdminModelMock = vi.fn();
const testAdminModelConnectionMock = vi.fn();

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
  ModelConfigurationError : MockModelConfigurationError,
  createAdminModel        : createAdminModelMock,
  listAdminModels         : listAdminModelsMock,
  updateAdminModel        : updateAdminModelMock,
  setDefaultAdminModel    : setDefaultAdminModelMock,
  testAdminModelConnection: testAdminModelConnectionMock
}));

/**
 * 文件定位（Next.js 管理端模型配置接口单测）：
 * - 覆盖 `GET /api/admin/models` 的路由行为，验证模型清单读取接口契约。
 * - 该接口是后台“模型管理”页面的数据入口，结果会影响可选模型、默认模型展示与策略配置。
 *
 * 业务边界：
 * - 仅 ADMIN 可访问（权限边界）。
 * - 服务异常需要映射为稳定的通用错误码，便于前端统一处理。
 */
describe("GET /api/admin/models", () => {
  beforeEach(() => {
    // 默认管理员身份，主流程先保障正常取数链路。
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    createAdminModelMock.mockReset();
    listAdminModelsMock.mockReset();
    updateAdminModelMock.mockReset();
    setDefaultAdminModelMock.mockReset();
    testAdminModelConnectionMock.mockReset();
    vi.resetModules();
  });

  it("returns admin models list with 200", async () => {
    // 成功分支：保证列表接口返回统一响应包，并可被前端稳定消费。
    listAdminModelsMock.mockResolvedValue([
      {
        id             : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39",
        name           : "DeepSeek V3",
        provider       : "deepseek",
        providerModelId: "deepseek-chat",
        aliasKey       : "deepseek-v3-stable",
        isEnabled      : true,
        isDefault      : true
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
    // 权限分支：防止非管理员查看或探测可用模型清单。
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
    // 异常分支：路由层兜底服务异常，避免原始错误泄漏到客户端。
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

describe("POST /api/admin/models", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    createAdminModelMock.mockReset();
    listAdminModelsMock.mockReset();
    updateAdminModelMock.mockReset();
    setDefaultAdminModelMock.mockReset();
    testAdminModelConnectionMock.mockReset();
    vi.resetModules();
  });

  it("creates model config with 201", async () => {
    createAdminModelMock.mockResolvedValue({
      id             : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39",
      provider       : "DeepSeek",
      protocol       : "openai-compatible",
      name           : "DeepSeek V4",
      providerModelId: "deepseek-chat-v4",
      baseUrl        : "https://api.deepseek.com"
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        provider : "DeepSeek",
        protocol : "openai-compatible",
        name     : "DeepSeek V4",
        modelId  : "deepseek-chat-v4",
        baseUrl  : "https://api.deepseek.com",
        apiKey   : "secret-key",
        isEnabled: true
      })
    }));

    expect(response.status).toBe(201);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MODEL_CREATED");
    expect(createAdminModelMock).toHaveBeenCalledWith({
      provider : "DeepSeek",
      protocol : "openai-compatible",
      name     : "DeepSeek V4",
      modelId  : "deepseek-chat-v4",
      baseUrl  : "https://api.deepseek.com",
      apiKey   : "secret-key",
      isEnabled: true
    });
  });

  it("returns 400 when create body is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        provider: "DeepSeek",
        protocol: "openai-compatible",
        name    : "DeepSeek V4",
        modelId : "deepseek-chat-v4",
        baseUrl : "not-a-url"
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("BaseURL 格式不合法");
    expect(createAdminModelMock).not.toHaveBeenCalled();
  });

  it("maps model configuration errors", async () => {
    createAdminModelMock.mockRejectedValue(new MockModelConfigurationError(
      "ADMIN_MODEL_ENDPOINT_DUPLICATE",
      "模型 endpoint 已存在",
      409
    ));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        provider: "DeepSeek",
        protocol: "openai-compatible",
        name    : "DeepSeek V4",
        modelId : "deepseek-chat-v4",
        baseUrl : "https://api.deepseek.com"
      })
    }));

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("ADMIN_MODEL_ENDPOINT_DUPLICATE");
  });

  it("returns 500 when create service throws unexpectedly", async () => {
    createAdminModelMock.mockRejectedValue(new Error("write failed"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/models", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        provider: "DeepSeek",
        protocol: "openai-compatible",
        name    : "DeepSeek V4",
        modelId : "deepseek-chat-v4",
        baseUrl : "https://api.deepseek.com"
      })
    }));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("模型创建失败");
  });
});
