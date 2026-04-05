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

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AiCallExhaustedError, createAiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import type { ModelStrategyResolver } from "@/server/modules/analysis/services/ModelStrategyResolver";
import { PipelineStage } from "@/types/pipeline";

const PRIMARY_MODEL = {
  modelId    : "11111111-1111-4111-8111-111111111111",
  provider   : "deepseek",
  modelName  : "deepseek-chat",
  displayName: "Primary",
  baseUrl    : "https://api.deepseek.com",
  apiKey     : "plain-primary",
  source     : "JOB" as const,
  params     : {
    temperature    : 0.2,
    maxOutputTokens: 4096,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 0
  }
};

const FALLBACK_MODEL = {
  modelId    : "22222222-2222-4222-8222-222222222222",
  provider   : "deepseek",
  modelName  : "deepseek-chat-fallback",
  displayName: "Fallback",
  baseUrl    : "https://api.deepseek.com",
  apiKey     : "plain-fallback",
  source     : "FALLBACK" as const,
  params     : {
    temperature    : 0.2,
    maxOutputTokens: 4096,
    topP           : 1,
    maxRetries     : 0,
    retryBaseMs    : 0
  }
};

/**
 * 被测对象：AiCallExecutor。
 * 测试目标：验证重试日志、fallback 切换和反递归保护。
 * 覆盖范围：retry success / fallback success / fallback boundary failure。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("AiCallExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("retries retryable errors and writes phase logs", async () => {
    // Arrange: 首次调用返回限流错误，第二次成功。
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const resolverMock: ModelStrategyResolver = {
      resolveForStage       : vi.fn().mockResolvedValue(PRIMARY_MODEL),
      resolveFallback       : vi.fn().mockResolvedValue(FALLBACK_MODEL),
      preloadStrategy       : vi.fn(),
      clearPreloadedStrategy: vi.fn()
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, resolverMock);

    const callFn = vi.fn()
      .mockRejectedValueOnce(new Error("429 rate limit"))
      .mockResolvedValueOnce({
        data : { ok: true },
        usage: {
          promptTokens    : 12,
          completionTokens: 8,
          totalTokens     : 20
        }
      });

    // Act
    const result = await executor.execute({
      stage     : PipelineStage.CHUNK_EXTRACTION,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      chapterId : "chapter-1",
      chunkIndex: 0,
      context   : { jobId: "job-1", bookId: "book-1" },
      callFn
    });

    // Assert: 调用重试一次，并保留 RETRIED + SUCCESS 两条日志。
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ ok: true });
    expect(result.isFallback).toBe(false);
    expect(result.modelId).toBe(PRIMARY_MODEL.modelId);

    expect(phaseLogCreate).toHaveBeenCalledTimes(2);
    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        status     : "RETRIED",
        isFallback : false,
        modelSource: "JOB"
      })
    }));
    expect(phaseLogCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        status          : "SUCCESS",
        promptTokens    : 12,
        completionTokens: 8
      })
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("records RETRIED usage when retryable error payload includes token usage", async () => {
    // Arrange: Provider 可能在 429/timeout 错误中返回 usage，执行器应写入 RETRIED 日志。
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const resolverMock: ModelStrategyResolver = {
      resolveForStage       : vi.fn().mockResolvedValue(PRIMARY_MODEL),
      resolveFallback       : vi.fn().mockResolvedValue(FALLBACK_MODEL),
      preloadStrategy       : vi.fn(),
      clearPreloadedStrategy: vi.fn()
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, resolverMock);

    const retryableError = new Error("429 rate limit") as Error & {
      response?: {
        data?: {
          usage?: {
            prompt_tokens?    : number;
            completion_tokens?: number;
            total_tokens?     : number;
          };
        };
      };
    };
    retryableError.response = {
      data: {
        usage: {
          prompt_tokens    : 21,
          completion_tokens: 9,
          total_tokens     : 30
        }
      }
    };

    const callFn = vi.fn()
      .mockRejectedValueOnce(retryableError)
      .mockResolvedValueOnce({
        data : { ok: true },
        usage: {
          promptTokens    : 10,
          completionTokens: 6,
          totalTokens     : 16
        }
      });

    // Act
    await executor.execute({
      stage     : PipelineStage.CHUNK_EXTRACTION,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      chapterId : "chapter-1",
      chunkIndex: 0,
      context   : { jobId: "job-1", bookId: "book-1" },
      callFn
    });

    // Assert: 第一条 RETRIED 日志已写入错误响应中的 usage。
    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        status          : "RETRIED",
        promptTokens    : 21,
        completionTokens: 9
      })
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("switches to fallback model after primary failure", async () => {
    // Arrange: 主模型不允许重试，首次失败后应切到 fallback。
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const resolverMock: ModelStrategyResolver = {
      resolveForStage: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        params: { ...PRIMARY_MODEL.params, maxRetries: 0 }
      }),
      resolveFallback       : vi.fn().mockResolvedValue(FALLBACK_MODEL),
      preloadStrategy       : vi.fn(),
      clearPreloadedStrategy: vi.fn()
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, resolverMock);

    const nonRetryableError = new Error("invalid json payload") as Error & {
      response?: {
        data?: {
          usage?: {
            prompt_tokens?    : number;
            completion_tokens?: number;
          };
        };
      };
    };
    nonRetryableError.response = {
      data: {
        usage: {
          prompt_tokens    : 17,
          completion_tokens: 5
        }
      }
    };

    const callFn = vi.fn(async ({ model }: { model: { modelId: string } }) => {
      if (model.modelId === PRIMARY_MODEL.modelId) {
        throw nonRetryableError;
      }
      return { data: { via: "fallback" }, usage: null };
    });

    // Act
    const result = await executor.execute({
      stage  : PipelineStage.CHUNK_EXTRACTION,
      prompt : { system: "s", user: "u" },
      jobId  : "job-1",
      context: { jobId: "job-1", bookId: "book-1" },
      callFn
    });

    // Assert: 成功来自 fallback，且日志分别记录主模型失败与兜底成功。
    expect(result.data).toEqual({ via: "fallback" });
    expect(result.isFallback).toBe(true);
    expect(result.modelId).toBe(FALLBACK_MODEL.modelId);
    expect(resolverMock.resolveFallback).toHaveBeenCalledTimes(1);
    expect(phaseLogCreate).toHaveBeenCalledTimes(2);
    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        status          : "ERROR",
        isFallback      : false,
        promptTokens    : 17,
        completionTokens: 5
      })
    }));
    expect(phaseLogCreate).toHaveBeenNthCalledWith(2, expect.objectContaining({
      data: expect.objectContaining({
        status     : "SUCCESS",
        isFallback : true,
        modelSource: "FALLBACK"
      })
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws AiCallExhaustedError when fallback equals primary model", async () => {
    // Arrange: fallback 与主模型相同，应触发反递归保护。
    const resolverMock: ModelStrategyResolver = {
      resolveForStage: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        params: { ...PRIMARY_MODEL.params, maxRetries: 0 }
      }),
      resolveFallback: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        source: "FALLBACK"
      }),
      preloadStrategy       : vi.fn(),
      clearPreloadedStrategy: vi.fn()
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, resolverMock);

    // Act + Assert
    await expect(executor.execute({
      stage  : PipelineStage.CHUNK_EXTRACTION,
      prompt : { system: "s", user: "u" },
      jobId  : "job-1",
      context: { jobId: "job-1", bookId: "book-1" },
      callFn : async () => {
        throw new Error("invalid json payload");
      }
    })).rejects.toBeInstanceOf(AiCallExhaustedError);
  });
});
