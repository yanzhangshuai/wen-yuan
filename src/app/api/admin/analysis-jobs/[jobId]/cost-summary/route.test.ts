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
