/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证功能点模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiCallExhaustedError,
  aiCallExecutorTesting,
  createAiCallExecutor,
  type AiCallExecutorDeps
} from "@/server/modules/analysis/services/AiCallExecutor";
import type { ResolvedFeatureModel } from "@/server/modules/models/featureModels";
import { FeatureKey } from "@/types/pipeline";

const PRIMARY_MODEL: ResolvedFeatureModel = {
  modelId    : "11111111-1111-4111-8111-111111111111",
  provider   : "deepseek",
  protocol   : "openai-compatible",
  modelName  : "deepseek-chat",
  displayName: "Primary",
  baseUrl    : "https://api.deepseek.com",
  apiKey     : "plain-primary",
  source     : "FEATURE",
  params     : {
    maxRetries : 1,
    retryBaseMs: 0
  }
};

const FALLBACK_MODEL: ResolvedFeatureModel = {
  ...PRIMARY_MODEL,
  modelId    : "22222222-2222-4222-8222-222222222222",
  modelName  : "deepseek-chat-fallback",
  displayName: "Fallback",
  source     : "SYSTEM_DEFAULT",
  params     : {
    maxRetries : 0,
    retryBaseMs: 0
  }
};

/**
 * 被测对象：AiCallExecutor。
 * 测试目标：验证重试日志、fallback 切换和反递归保护（按功能点 featureKey 解析模型）。
 * 覆盖范围：retry success / fallback success / fallback boundary failure。
 */
describe("AiCallExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("retries retryable errors and writes phase logs", async () => {
    // Arrange: 首次调用返回限流错误，第二次成功。
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel : vi.fn().mockResolvedValue(PRIMARY_MODEL),
      resolveFallbackModel: vi.fn().mockResolvedValue(FALLBACK_MODEL)
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

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
      featureKey: FeatureKey.PIPELINE_MAIN,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      chapterId : "chapter-1",
      chunkIndex: 0,
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
        modelSource: "FEATURE",
        stage      : FeatureKey.PIPELINE_MAIN
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
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel : vi.fn().mockResolvedValue(PRIMARY_MODEL),
      resolveFallbackModel: vi.fn().mockResolvedValue(FALLBACK_MODEL)
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

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
      featureKey: FeatureKey.PIPELINE_MAIN,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      chapterId : "chapter-1",
      chunkIndex: 0,
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
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        params: { ...PRIMARY_MODEL.params, maxRetries: 0 }
      }),
      resolveFallbackModel: vi.fn().mockResolvedValue(FALLBACK_MODEL)
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

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
      featureKey: FeatureKey.PIPELINE_MAIN,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      callFn
    });

    // Assert: 成功来自 fallback，且日志分别记录主模型失败与兜底成功。
    expect(result.data).toEqual({ via: "fallback" });
    expect(result.isFallback).toBe(true);
    expect(result.modelId).toBe(FALLBACK_MODEL.modelId);
    expect(depsMock.resolveFallbackModel).toHaveBeenCalledTimes(1);
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
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        params: { ...PRIMARY_MODEL.params, maxRetries: 0 }
      }),
      resolveFallbackModel: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        source: "SYSTEM_DEFAULT"
      })
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

    // Act + Assert
    await expect(executor.execute({
      featureKey: FeatureKey.PIPELINE_MAIN,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      callFn    : async () => {
        throw new Error("invalid json payload");
      }
    })).rejects.toBeInstanceOf(AiCallExhaustedError);
  });

  it("covers helper branches for retry detection, nested reads and usage normalization", () => {
    const longMessage = "x".repeat(1205);

    expect(aiCallExecutorTesting.isRetryableError(new Error("socket hang up"))).toBe(true);
    expect(aiCallExecutorTesting.isRetryableError("Temporarily unavailable")).toBe(true);
    expect(aiCallExecutorTesting.isRetryableError(new Error("schema mismatch"))).toBe(false);

    expect(aiCallExecutorTesting.toErrorMessage(new Error(longMessage))).toBe("x".repeat(1000));
    expect(aiCallExecutorTesting.toErrorMessage(42)).toBe("42");

    expect(aiCallExecutorTesting.toRecord({ ok: true })).toEqual({ ok: true });
    expect(aiCallExecutorTesting.toRecord("text")).toBeNull();
    expect(aiCallExecutorTesting.toRecord(null)).toBeNull();

    expect(aiCallExecutorTesting.getNestedValue({ a: { b: { c: 3 } } }, ["a", "b", "c"])).toBe(3);
    expect(aiCallExecutorTesting.getNestedValue({ a: 1 }, ["a", "b"])).toBeNull();
    expect(aiCallExecutorTesting.getNestedValue({ a: { b: 1 } }, ["a", "missing"])).toBeNull();

    expect(aiCallExecutorTesting.normalizeUsage({
      promptTokens    : 11,
      completionTokens: 7,
      totalTokens     : 18
    })).toEqual({
      promptTokens    : 11,
      completionTokens: 7,
      totalTokens     : 18
    });
    expect(aiCallExecutorTesting.normalizeUsage({
      prompt_tokens    : 13,
      completion_tokens: 5,
      total_tokens     : 18
    })).toEqual({
      promptTokens    : 13,
      completionTokens: 5,
      totalTokens     : 18
    });
    expect(aiCallExecutorTesting.normalizeUsage({
      promptTokenCount    : 17,
      candidatesTokenCount: 9,
      totalTokenCount     : 26
    })).toEqual({
      promptTokens    : 17,
      completionTokens: 9,
      totalTokens     : 26
    });
    expect(aiCallExecutorTesting.normalizeUsage({ unrelated: true })).toBeNull();
    expect(aiCallExecutorTesting.normalizeUsage("invalid")).toBeNull();
  });

  it("extracts usage from nested provider error payloads", () => {
    expect(aiCallExecutorTesting.extractUsageFromError({
      usage: {
        promptTokens    : 5,
        completionTokens: 4,
        totalTokens     : 9
      }
    })).toEqual({
      promptTokens    : 5,
      completionTokens: 4,
      totalTokens     : 9
    });

    expect(aiCallExecutorTesting.extractUsageFromError({
      response: {
        data: {
          usageMetadata: {
            promptTokenCount    : 8,
            candidatesTokenCount: 6,
            totalTokenCount     : 14
          }
        }
      }
    })).toEqual({
      promptTokens    : 8,
      completionTokens: 6,
      totalTokens     : 14
    });

    expect(aiCallExecutorTesting.extractUsageFromError({
      cause: {
        response: {
          data: {
            usage: {
              prompt_tokens    : 12,
              completion_tokens: 2,
              total_tokens     : 14
            }
          }
        }
      }
    })).toEqual({
      promptTokens    : 12,
      completionTokens: 2,
      totalTokens     : 14
    });

    expect(aiCallExecutorTesting.extractUsageFromError({
      cause: { response: { data: { usage: { bad: true } } } }
    })).toBeNull();
  });

  it("uses stageLabel as phase log stage when provided", async () => {
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel : vi.fn().mockResolvedValue(PRIMARY_MODEL),
      resolveFallbackModel: vi.fn().mockResolvedValue(FALLBACK_MODEL)
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

    await executor.execute({
      featureKey: FeatureKey.PIPELINE_MAIN,
      stageLabel: "ROSTER_DISCOVERY",
      prompt    : { system: "s", user: "u" },
      jobId     : "job-1",
      callFn    : async () => ({ data: { ok: true }, usage: null })
    });

    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        stage: "ROSTER_DISCOVERY"
      })
    }));
  });

  it("does not recurse to fallback when the fallback model is unavailable", async () => {
    const resolveFallback = vi.fn().mockResolvedValue(null);
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        params: { ...PRIMARY_MODEL.params, maxRetries: 0 }
      }),
      resolveFallbackModel: resolveFallback
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

    await expect(executor.execute({
      featureKey: FeatureKey.SKILL_SELECTOR,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-fallback-stage",
      callFn    : async () => {
        throw new Error("bad request");
      }
    })).rejects.toMatchObject({
      isFallback: false,
      modelId   : PRIMARY_MODEL.modelId,
      featureKey: FeatureKey.SKILL_SELECTOR
    });

    expect(resolveFallback).toHaveBeenCalledTimes(1);
  });

  it("marks the exhausted error as fallback when the fallback model also fails", async () => {
    const depsMock: AiCallExecutorDeps = {
      resolvePrimaryModel: vi.fn().mockResolvedValue({
        ...PRIMARY_MODEL,
        params: { ...PRIMARY_MODEL.params, maxRetries: 0 }
      }),
      resolveFallbackModel: vi.fn().mockResolvedValue({
        ...FALLBACK_MODEL,
        params: { ...FALLBACK_MODEL.params, maxRetries: 0 }
      })
    };
    const prismaMock = {
      analysisPhaseLog: {
        create: vi.fn().mockResolvedValue(undefined)
      }
    };
    const executor = createAiCallExecutor(prismaMock as never, depsMock);

    await expect(executor.execute({
      featureKey: FeatureKey.PIPELINE_MAIN,
      prompt    : { system: "s", user: "u" },
      jobId     : "job-fallback-failed",
      callFn    : async ({ model }) => {
        throw new Error(`model ${model.modelId} failed`);
      }
    })).rejects.toMatchObject({
      isFallback: true,
      modelId   : FALLBACK_MODEL.modelId,
      featureKey: FeatureKey.PIPELINE_MAIN
    });
  });
});
