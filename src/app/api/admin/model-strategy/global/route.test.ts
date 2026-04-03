import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const getGlobalStrategyMock = vi.fn<() => Promise<unknown>>();
const saveGlobalStrategyMock = vi.fn<(stages: unknown) => Promise<unknown>>();

class ModelStrategyValidationError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/analysis/services/modelStrategyAdminService", () => ({
  getGlobalStrategy,
  saveGlobalStrategy,
  ModelStrategyValidationError
}));

function getGlobalStrategy(): Promise<unknown> {
  return getGlobalStrategyMock();
}

function saveGlobalStrategy(stages: unknown): Promise<unknown> {
  return saveGlobalStrategyMock(stages);
}

/**
 * 被测对象：GET /api/admin/model-strategy/global。
 * 测试目标：验证全局策略读取接口的鉴权与错误分支响应契约。
 * 覆盖范围：success / auth failure / internal error。
 */
describe("GET /api/admin/model-strategy/global", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getGlobalStrategyMock.mockReset();
    saveGlobalStrategyMock.mockReset();
    vi.resetModules();
  });

  it("returns global strategy with 200", async () => {
    // Arrange
    getGlobalStrategyMock.mockResolvedValue({
      id    : "85d0eaf1-f604-420f-9ec8-f61e42f7fc3f",
      scope : "GLOBAL",
      bookId: null,
      jobId : null,
      stages: {
        ROSTER_DISCOVERY: {
          modelId: "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c"
        }
      },
      createdAt: "2026-04-03T01:00:00.000Z",
      updatedAt: "2026-04-03T01:00:00.000Z"
    });
    const { GET } = await import("./route");

    // Act
    const response = await GET();

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_GLOBAL_MODEL_STRATEGY_FETCHED");
    expect(getGlobalStrategyMock).toHaveBeenCalledOnce();
  });

  it("returns 403 when auth guard fails", async () => {
    // Arrange
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    // Act
    const response = await GET();

    // Assert
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(getGlobalStrategyMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    // Arrange
    getGlobalStrategyMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    // Act
    const response = await GET();

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("全局模型策略获取失败");
  });
});

/**
 * 被测对象：PUT /api/admin/model-strategy/global。
 * 测试目标：验证全局策略写入接口的参数校验、鉴权与业务错误映射。
 * 覆盖范围：success / auth failure / bad request / validation error / internal error。
 */
describe("PUT /api/admin/model-strategy/global", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getGlobalStrategyMock.mockReset();
    saveGlobalStrategyMock.mockReset();
    vi.resetModules();
  });

  it("saves global strategy with 200", async () => {
    // Arrange
    const modelId = "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c";
    saveGlobalStrategyMock.mockResolvedValue({
      id    : "85d0eaf1-f604-420f-9ec8-f61e42f7fc3f",
      scope : "GLOBAL",
      bookId: null,
      jobId : null,
      stages: {
        FALLBACK: {
          modelId
        }
      },
      createdAt: "2026-04-03T01:00:00.000Z",
      updatedAt: "2026-04-03T01:20:00.000Z"
    });
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(new Request("http://localhost/api/admin/model-strategy/global", {
      method : "PUT",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        stages: {
          FALLBACK: { modelId }
        }
      })
    }));

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_GLOBAL_MODEL_STRATEGY_SAVED");
    expect(saveGlobalStrategyMock).toHaveBeenCalledWith({
      FALLBACK: { modelId }
    });
  });

  it("returns 403 when auth guard fails", async () => {
    // Arrange
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(new Request("http://localhost/api/admin/model-strategy/global", {
      method : "PUT",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({ stages: {} })
    }));

    // Assert
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(saveGlobalStrategyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    // Arrange
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(new Request("http://localhost/api/admin/model-strategy/global", {
      method : "PUT",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        stages: {
          FALLBACK: { modelId: "invalid-id" }
        }
      })
    }));

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(saveGlobalStrategyMock).not.toHaveBeenCalled();
  });

  it("returns 400 when model strategy validation fails", async () => {
    // Arrange
    saveGlobalStrategyMock.mockRejectedValue(new ModelStrategyValidationError("模型 DeepSeek 不存在或未启用"));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(new Request("http://localhost/api/admin/model-strategy/global", {
      method : "PUT",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        stages: {
          FALLBACK: { modelId: "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c" }
        }
      })
    }));

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.message).toBe("模型 DeepSeek 不存在或未启用");
  });

  it("returns 500 when service throws", async () => {
    // Arrange
    saveGlobalStrategyMock.mockRejectedValue(new Error("write failed"));
    const { PUT } = await import("./route");

    // Act
    const response = await PUT(new Request("http://localhost/api/admin/model-strategy/global", {
      method : "PUT",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        stages: {
          FALLBACK: { modelId: "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c" }
        }
      })
    }));

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("全局模型策略保存失败");
  });
});
