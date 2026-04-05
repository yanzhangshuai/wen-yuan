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
const getJobCostSummaryMock = vi.fn<(jobId: string) => Promise<unknown>>();

class AnalysisJobNotFoundError extends Error {
  readonly jobId: string;

  constructor(jobId: string) {
    super(`Analysis job not found: ${jobId}`);
    this.jobId = jobId;
  }
}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/analysis/services/modelStrategyAdminService", () => ({
  getJobCostSummary,
  AnalysisJobNotFoundError
}));

function getJobCostSummary(jobId: string): Promise<unknown> {
  return getJobCostSummaryMock(jobId);
}

/**
 * 被测对象：GET /api/admin/analysis-jobs/:jobId/cost-summary。
 * 测试目标：验证成本聚合接口在鉴权、参数校验、资源不存在与服务异常下的响应契约。
 * 覆盖范围：success / auth failure / bad request / not found / internal error。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GET /api/admin/analysis-jobs/:jobId/cost-summary", () => {
  const validJobId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";

  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    getJobCostSummaryMock.mockReset();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns cost summary with 200", async () => {
    // Arrange
    getJobCostSummaryMock.mockResolvedValue({
      jobId                : validJobId,
      totalPromptTokens    : 1200,
      totalCompletionTokens: 3400,
      totalDurationMs      : 5600,
      totalCalls           : 7,
      failedCalls          : 1,
      fallbackCalls        : 2,
      byStage              : [
        {
          stage           : "CHUNK_EXTRACTION",
          calls           : 3,
          promptTokens    : 500,
          completionTokens: 1800,
          avgDurationMs   : 800,
          models          : [
            {
              modelId         : "fbbf5c96-6fc7-44e6-bc97-c06cf9cd998c",
              modelName       : "DeepSeek V3",
              isFallback      : false,
              calls           : 2,
              promptTokens    : 340,
              completionTokens: 1300
            },
            {
              modelId         : "fe87efbb-7dd1-40d8-ad89-bf0b8f2c26f3",
              modelName       : "Gemini Flash",
              isFallback      : true,
              calls           : 1,
              promptTokens    : 160,
              completionTokens: 500
            }
          ]
        }
      ]
    });
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/analysis-jobs/${validJobId}/cost-summary`),
      { params: Promise.resolve({ jobId: validJobId }) }
    );

    // Assert
    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_ANALYSIS_JOB_COST_SUMMARY_FETCHED");
    expect(getJobCostSummaryMock).toHaveBeenCalledWith(validJobId);
    expect(payload.data.byStage[0]?.models).toHaveLength(2);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when auth guard fails", async () => {
    // Arrange
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/analysis-jobs/${validJobId}/cost-summary`),
      { params: Promise.resolve({ jobId: validJobId }) }
    );

    // Assert
    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(getJobCostSummaryMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when route params are invalid", async () => {
    // Arrange
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request("http://localhost/api/admin/analysis-jobs/invalid/cost-summary"),
      { params: Promise.resolve({ jobId: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(payload.error?.detail).toBe("任务 ID 不合法");
    expect(getJobCostSummaryMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when analysis job does not exist", async () => {
    // Arrange
    getJobCostSummaryMock.mockRejectedValue(new AnalysisJobNotFoundError(validJobId));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/analysis-jobs/${validJobId}/cost-summary`),
      { params: Promise.resolve({ jobId: validJobId }) }
    );

    // Assert
    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
    expect(payload.message).toBe("分析任务不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 500 when service throws", async () => {
    // Arrange
    getJobCostSummaryMock.mockRejectedValue(new Error("db unavailable"));
    const { GET } = await import("./route");

    // Act
    const response = await GET(
      new Request(`http://localhost/api/admin/analysis-jobs/${validJobId}/cost-summary`),
      { params: Promise.resolve({ jobId: validJobId }) }
    );

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.message).toBe("任务成本概览获取失败");
  });
});
