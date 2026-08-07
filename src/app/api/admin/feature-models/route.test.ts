/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 `src/app/api/admin/feature-models/route.ts`，验证功能点模型接口契约。
 * - v5 阶段 4：模型按功能点（SKILL_SELECTOR / PIPELINE_MAIN / REVIEW）全局映射，接口提供
 *   映射查询（GET）与维护（PUT）。
 *
 * 业务职责：
 * - 约束鉴权、参数校验、服务层调用参数与统一响应包结构。
 * - 保护“功能点模型管理”的读写边界，避免前端越权或误配。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listFeatureModelsMock = vi.fn();
const upsertFeatureModelMock = vi.fn();

class MockFeatureModelError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FeatureModelError";
  }
}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/models/featureModels", () => ({
  FeatureModelError : MockFeatureModelError,
  listFeatureModels : listFeatureModelsMock,
  upsertFeatureModel: upsertFeatureModelMock
}));

describe("GET /api/admin/feature-models", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listFeatureModelsMock.mockReset();
    upsertFeatureModelMock.mockReset();
    vi.resetModules();
  });

  it("returns feature-model list with 200", async () => {
    listFeatureModelsMock.mockResolvedValue([
      {
        featureKey  : "SKILL_SELECTOR",
        modelId     : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39",
        modelName   : "DeepSeek V3",
        provider    : "deepseek",
        isConfigured: true,
        updatedAt   : "2026-08-07T00:00:00.000Z"
      },
      {
        featureKey  : "PIPELINE_MAIN",
        modelId     : null,
        modelName   : null,
        provider    : null,
        isConfigured: false,
        updatedAt   : null
      },
      {
        featureKey  : "REVIEW",
        modelId     : null,
        modelName   : null,
        provider    : null,
        isConfigured: false,
        updatedAt   : null
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_FEATURE_MODELS_LISTED");
    expect(payload.data).toHaveLength(3);
    expect(payload.data[0]?.modelId).toBe("3b80dad4-cb27-4ff8-a2fd-91a0f91cad39");
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(listFeatureModelsMock).not.toHaveBeenCalled();
  });

  it("returns 500 when service throws", async () => {
    listFeatureModelsMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    const response = await GET();

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});

describe("PUT /api/admin/feature-models", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listFeatureModelsMock.mockReset();
    upsertFeatureModelMock.mockReset();
    vi.resetModules();
  });

  it("upserts a feature-model mapping and returns the updated item", async () => {
    upsertFeatureModelMock.mockResolvedValue(undefined);
    listFeatureModelsMock.mockResolvedValue([
      {
        featureKey  : "SKILL_SELECTOR",
        modelId     : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39",
        modelName   : "DeepSeek V3",
        provider    : "deepseek",
        isConfigured: true,
        updatedAt   : "2026-08-07T00:00:00.000Z"
      },
      {
        featureKey  : "PIPELINE_MAIN",
        modelId     : null,
        modelName   : null,
        provider    : null,
        isConfigured: false,
        updatedAt   : null
      },
      {
        featureKey  : "REVIEW",
        modelId     : null,
        modelName   : null,
        provider    : null,
        isConfigured: false,
        updatedAt   : null
      }
    ]);
    const { PUT } = await import("./route");

    const response = await PUT(new Request("http://localhost/api/admin/feature-models", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        featureKey: "SKILL_SELECTOR",
        modelId   : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39"
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_FEATURE_MODEL_UPSERTED");
    expect(upsertFeatureModelMock).toHaveBeenCalledWith(
      "SKILL_SELECTOR",
      "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39"
    );
    expect(payload.data?.featureKey).toBe("SKILL_SELECTOR");
  });

  it("clears a mapping when modelId is null", async () => {
    upsertFeatureModelMock.mockResolvedValue(undefined);
    listFeatureModelsMock.mockResolvedValue([]);
    const { PUT } = await import("./route");

    const response = await PUT(new Request("http://localhost/api/admin/feature-models", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ featureKey: "REVIEW", modelId: null })
    }));

    expect(response.status).toBe(200);
    expect(upsertFeatureModelMock).toHaveBeenCalledWith("REVIEW", null);
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { PUT } = await import("./route");

    const response = await PUT(new Request("http://localhost/api/admin/feature-models", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ featureKey: "REVIEW", modelId: null })
    }));

    expect(response.status).toBe(403);
    expect(upsertFeatureModelMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const { PUT } = await import("./route");

    const response = await PUT(new Request("http://localhost/api/admin/feature-models", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ featureKey: "UNKNOWN", modelId: "not-a-uuid" })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(upsertFeatureModelMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the target model is invalid or disabled", async () => {
    upsertFeatureModelMock.mockRejectedValue(new MockFeatureModelError("功能点模型未启用，请先在模型管理中启用"));
    const { PUT } = await import("./route");

    const response = await PUT(new Request("http://localhost/api/admin/feature-models", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        featureKey: "PIPELINE_MAIN",
        modelId   : "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39"
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.error?.detail).toBe("功能点模型未启用，请先在模型管理中启用");
  });

  it("returns 500 when service throws unexpectedly", async () => {
    upsertFeatureModelMock.mockRejectedValue(new Error("db unavailable"));
    const { PUT } = await import("./route");

    const response = await PUT(new Request("http://localhost/api/admin/feature-models", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ featureKey: "REVIEW", modelId: null })
    }));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });
});
