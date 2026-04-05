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
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
