/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@/generated/prisma/client";

import {
  AnalysisJobNotFoundError,
  createModelStrategyAdminService
} from "@/server/modules/analysis/services/modelStrategyAdminService";

function createPrismaMock() {
  // 只构造当前测试路径需要的最小 Prisma 读写面，避免无关 mock 干扰断言。
  return {
    analysisJob: {
      findUnique: vi.fn()
    },
    analysisPhaseLog: {
      findMany: vi.fn()
    },
    modelStrategyConfig: {
      findFirst: vi.fn(),
      create   : vi.fn(),
      update   : vi.fn()
    },
    aiModel: {
      findMany  : vi.fn(),
      findUnique: vi.fn()
    },
    book: {
      findFirst: vi.fn()
    }
  };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("modelStrategyAdminService.getJobCostSummary", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws AnalysisJobNotFoundError when job does not exist", async () => {
    // Arrange
    const prismaMock = createPrismaMock();
    prismaMock.analysisJob.findUnique.mockResolvedValue(null);
    const service = createModelStrategyAdminService(prismaMock as never);

    // Act + Assert
    await expect(service.getJobCostSummary("missing-job")).rejects.toBeInstanceOf(AnalysisJobNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns zero summary when phase logs are empty", async () => {
    // Arrange
    const prismaMock = createPrismaMock();
    prismaMock.analysisJob.findUnique.mockResolvedValue({ id: "job-1" });
    prismaMock.analysisPhaseLog.findMany.mockResolvedValue([]);
    const service = createModelStrategyAdminService(prismaMock as never);

    // Act
    const summary = await service.getJobCostSummary("job-1");

    // Assert
    // 空日志场景必须返回“结构完整但数值归零”的响应，便于前端直接渲染。
    expect(summary).toEqual({
      jobId                : "job-1",
      totalPromptTokens    : 0,
      totalCompletionTokens: 0,
      totalDurationMs      : 0,
      totalCalls           : 0,
      failedCalls          : 0,
      fallbackCalls        : 0,
      byStage              : []
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("aggregates logs by execute key and separates model buckets by modelId + isFallback", async () => {
    // Arrange
    const prismaMock = createPrismaMock();
    prismaMock.analysisJob.findUnique.mockResolvedValue({ id: "job-1" });
    prismaMock.analysisPhaseLog.findMany.mockResolvedValue([
      {
        stage           : "CHUNK_EXTRACTION",
        chapterId       : "chapter-1",
        chunkIndex      : 0,
        status          : "RETRIED",
        isFallback      : false,
        promptTokens    : null,
        completionTokens: null,
        durationMs      : 40,
        modelId         : "model-primary",
        model           : { name: "Primary Model" }
      },
      {
        stage           : "CHUNK_EXTRACTION",
        chapterId       : "chapter-1",
        chunkIndex      : 0,
        status          : "SUCCESS",
        isFallback      : false,
        promptTokens    : 100,
        completionTokens: 200,
        durationMs      : 60,
        modelId         : "model-primary",
        model           : { name: "Primary Model" }
      },
      {
        stage           : "CHUNK_EXTRACTION",
        chapterId       : "chapter-1",
        chunkIndex      : 1,
        status          : "SUCCESS",
        isFallback      : true,
        promptTokens    : 30,
        completionTokens: 50,
        durationMs      : 25,
        modelId         : "model-primary",
        model           : { name: "Primary Model" }
      },
      {
        stage           : "CHUNK_EXTRACTION",
        chapterId       : "chapter-1",
        chunkIndex      : 2,
        status          : "SUCCESS",
        isFallback      : true,
        promptTokens    : 20,
        completionTokens: 40,
        durationMs      : 35,
        modelId         : "model-fallback",
        model           : { name: "Fallback Model" }
      },
      {
        stage           : "CHUNK_EXTRACTION",
        chapterId       : "chapter-1",
        chunkIndex      : 3,
        status          : "ERROR",
        isFallback      : false,
        promptTokens    : 10,
        completionTokens: 0,
        durationMs      : 15,
        modelId         : "model-primary",
        model           : { name: "Primary Model" }
      },
      {
        stage           : "TITLE_RESOLUTION",
        chapterId       : null,
        chunkIndex      : null,
        status          : "SUCCESS",
        isFallback      : false,
        promptTokens    : 8,
        completionTokens: 16,
        durationMs      : 20,
        modelId         : "model-title",
        model           : { name: "Title Model" }
      }
    ]);
    const service = createModelStrategyAdminService(prismaMock as never);

    // Act
    const summary = await service.getJobCostSummary("job-1");

    // Assert
    // totalCalls=5：同 execute key 的 RETRIED + SUCCESS 折叠为 1 次调用，但 duration 会累计。
    expect(summary.totalCalls).toBe(5);
    expect(summary.failedCalls).toBe(1);
    // fallbackCalls=2：chunk-1 与 chunk-2 为 fallback 成功调用，需与主调用分离统计。
    expect(summary.fallbackCalls).toBe(2);
    expect(summary.totalPromptTokens).toBe(168);
    expect(summary.totalCompletionTokens).toBe(306);
    expect(summary.totalDurationMs).toBe(195);

    const chunkStage = summary.byStage.find((item) => item.stage === "CHUNK_EXTRACTION");
    expect(chunkStage).toBeDefined();
    expect(chunkStage?.calls).toBe(4);
    expect(chunkStage?.promptTokens).toBe(160);
    expect(chunkStage?.completionTokens).toBe(290);
    expect(chunkStage?.avgDurationMs).toBeCloseTo(53.3333, 4);

    const primaryMainline = chunkStage?.models.find((item) => item.modelId === "model-primary" && item.isFallback === false);
    const primaryFallback = chunkStage?.models.find((item) => item.modelId === "model-primary" && item.isFallback === true);
    const fallbackModel = chunkStage?.models.find((item) => item.modelId === "model-fallback" && item.isFallback === true);
    // 关键口径：同一 modelId 在 isFallback 不同的情况下必须拆分到独立桶。
    expect(primaryMainline).toEqual({
      modelId         : "model-primary",
      modelName       : "Primary Model",
      isFallback      : false,
      calls           : 2,
      promptTokens    : 110,
      completionTokens: 200
    });
    expect(primaryFallback).toEqual({
      modelId         : "model-primary",
      modelName       : "Primary Model",
      isFallback      : true,
      calls           : 1,
      promptTokens    : 30,
      completionTokens: 50
    });
    expect(fallbackModel).toEqual({
      modelId         : "model-fallback",
      modelName       : "Fallback Model",
      isFallback      : true,
      calls           : 1,
      promptTokens    : 20,
      completionTokens: 40
    });

    const titleStage = summary.byStage.find((item) => item.stage === "TITLE_RESOLUTION");
    expect(titleStage).toEqual({
      stage           : "TITLE_RESOLUTION",
      calls           : 1,
      promptTokens    : 8,
      completionTokens: 16,
      avgDurationMs   : 20,
      models          : [{
        modelId         : "model-title",
        modelName       : "Title Model",
        isFallback      : false,
        calls           : 1,
        promptTokens    : 8,
        completionTokens: 16
      }]
    });
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("modelStrategyAdminService.saveGlobalStrategy", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to findFirst + update when create hits P2002", async () => {
    // Arrange
    const prismaMock = createPrismaMock();
    const now = new Date("2026-04-03T00:00:00.000Z");
    const existingRow = {
      id       : "strategy-global-1",
      scope    : "GLOBAL" as const,
      bookId   : null,
      jobId    : null,
      stages   : {},
      createdAt: now,
      updatedAt: now
    };

    prismaMock.modelStrategyConfig.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(existingRow);
    prismaMock.modelStrategyConfig.create.mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed on the fields: (`scope`)",
        {
          code         : "P2002",
          clientVersion: "test"
        }
      )
    );
    prismaMock.modelStrategyConfig.update.mockResolvedValueOnce(existingRow);

    const service = createModelStrategyAdminService(prismaMock as never);

    // Act
    const result = await service.saveGlobalStrategy({});

    // Assert
    // 并发写入下 create 命中 P2002 后，应回退到 findFirst + update，而非再次 create。
    expect(prismaMock.modelStrategyConfig.findFirst).toHaveBeenCalledTimes(2);
    expect(prismaMock.modelStrategyConfig.update).toHaveBeenCalledWith({
      where : { id: "strategy-global-1" },
      data  : { stages: {} },
      select: expect.any(Object)
    });
    expect(result).toMatchObject({
      id    : "strategy-global-1",
      scope : "GLOBAL",
      stages: {}
    });
  });
});
