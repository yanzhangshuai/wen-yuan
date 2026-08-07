/**
 * 被测对象：AiCallExecutor。
 * 测试目标：验证统一默认模型调用、重试与阶段日志写入。
 * 覆盖范围：retry success / non-retryable error / exhausted error / helper branches / stage 写入。
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  AiCallExhaustedError,
  aiCallExecutorTesting,
  createAiCallExecutor
} from "@/server/modules/analysis/services/AiCallExecutor";
import { loadSystemDefaultModel } from "@/server/modules/models/defaultModel";
import type { ResolvedFeatureModel } from "@/server/modules/models/defaultModel";

vi.mock("@/server/modules/models/defaultModel", () => ({
  loadSystemDefaultModel: vi.fn()
}));

const DEFAULT_MODEL: ResolvedFeatureModel = {
  modelId    : "11111111-1111-4111-8111-111111111111",
  provider   : "deepseek",
  protocol   : "openai-compatible",
  modelName  : "deepseek-chat",
  displayName: "Default",
  baseUrl    : "https://api.deepseek.com",
  apiKey     : "plain-default",
  params     : {
    maxRetries : 1,
    retryBaseMs: 0
  }
};

const mockDefaultModel = vi.mocked(loadSystemDefaultModel);

describe("AiCallExecutor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDefaultModel.mockResolvedValue(DEFAULT_MODEL);
  });

  it("resolves the system default model and writes a SUCCESS phase log", async () => {
    // Arrange
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never);

    const callFn = vi.fn().mockResolvedValue({
      data : { ok: true },
      usage: {
        promptTokens    : 12,
        completionTokens: 8,
        totalTokens     : 20
      }
    });

    // Act
    const result = await executor.execute({
      stage : "INDEPENDENT_EXTRACTION",
      prompt: { system: "s", user: "u" },
      jobId : "job-1",
      callFn
    });

    // Assert: 只调用默认模型一次，写入 SUCCESS 日志，stage 透传。
    expect(mockDefaultModel).toHaveBeenCalledTimes(1);
    expect(callFn).toHaveBeenCalledTimes(1);
    expect(callFn).toHaveBeenCalledWith({ model: DEFAULT_MODEL, prompt: { system: "s", user: "u" } });
    expect(result).toEqual({
      data : { ok: true },
      usage: {
        promptTokens    : 12,
        completionTokens: 8,
        totalTokens     : 20
      }
    });

    expect(phaseLogCreate).toHaveBeenCalledTimes(1);
    expect(phaseLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status     : "SUCCESS",
        stage      : "INDEPENDENT_EXTRACTION",
        modelSource: "SYSTEM_DEFAULT",
        isFallback : false
      })
    }));
  });

  it("retries retryable errors and writes RETRIED then SUCCESS logs", async () => {
    // Arrange
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never);

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
      stage : "ROSTER_DISCOVERY",
      prompt: { system: "s", user: "u" },
      jobId : "job-1",
      callFn
    });

    // Assert: 重试一次，保留 RETRIED + SUCCESS 两条日志。
    expect(callFn).toHaveBeenCalledTimes(2);
    expect(result.data).toEqual({ ok: true });

    expect(phaseLogCreate).toHaveBeenCalledTimes(2);
    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        status     : "RETRIED",
        stage      : "ROSTER_DISCOVERY",
        modelSource: "SYSTEM_DEFAULT",
        isFallback : false
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

  it("records RETRIED usage when retryable error payload includes token usage", async () => {
    // Arrange
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never);

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
        usage: null
      });

    // Act
    await executor.execute({
      stage : "TITLE_RESOLUTION",
      prompt: { system: "s", user: "u" },
      jobId : "job-1",
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

  it("throws AiCallExhaustedError when a non-retryable error exhausts the attempt", async () => {
    // Arrange
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never);

    const callFn = vi.fn().mockRejectedValue(new Error("invalid json payload"));

    // Act + Assert: 非可重试错误在首次尝试后直接抛出，错误携带模型 ID。
    await expect(executor.execute({
      stage : "SKILL_SELECT",
      prompt: { system: "s", user: "u" },
      jobId : "job-1",
      callFn
    })).rejects.toBeInstanceOf(AiCallExhaustedError);

    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        status : "ERROR",
        stage  : "SKILL_SELECT",
        modelId: DEFAULT_MODEL.modelId
      })
    }));
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

  it("writes the provided stage to the phase log", async () => {
    // Arrange
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never);

    // Act
    await executor.execute({
      stage : "ROSTER_DISCOVERY",
      prompt: { system: "s", user: "u" },
      jobId : "job-1",
      callFn: async () => ({ data: { ok: true }, usage: null })
    });

    // Assert: stage 原样写入日志。
    expect(phaseLogCreate).toHaveBeenNthCalledWith(1, expect.objectContaining({
      data: expect.objectContaining({
        stage: "ROSTER_DISCOVERY"
      })
    }));
  });

  it("throws AiCallExhaustedError with modelId when all retry attempts fail", async () => {
    // Arrange
    mockDefaultModel.mockResolvedValue({
      ...DEFAULT_MODEL,
      params: { maxRetries: 0, retryBaseMs: 0 }
    });
    const phaseLogCreate = vi.fn().mockResolvedValue(undefined);
    const prismaMock = {
      analysisPhaseLog: {
        create: phaseLogCreate
      }
    };
    const executor = createAiCallExecutor(prismaMock as never);

    // Act + Assert
    await expect(executor.execute({
      stage : "INDEPENDENT_EXTRACTION",
      prompt: { system: "s", user: "u" },
      jobId : "job-exhausted",
      callFn: async () => {
        throw new Error("bad request");
      }
    })).rejects.toMatchObject({
      modelId: DEFAULT_MODEL.modelId
    });
  });
});
