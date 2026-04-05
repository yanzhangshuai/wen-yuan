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

import { createModelStrategyResolver } from "@/server/modules/analysis/services/ModelStrategyResolver";
import { PipelineStage } from "@/types/pipeline";

vi.mock("@/server/security/encryption", () => ({
  decryptValue: vi.fn().mockImplementation((value: string) => `plain:${value}`)
}));

const MODEL_IDS = {
  jobChunk      : "11111111-1111-4111-8111-111111111111",
  bookRoster    : "22222222-2222-4222-8222-222222222222",
  globalFallback: "33333333-3333-4333-8333-333333333333",
  systemDefault : "44444444-4444-4444-8444-444444444444"
} as const;

function buildModel(input: {
  id       : string;
  provider?: string;
  name?    : string;
  modelId? : string;
  apiKey?  : string | null;
}) {
  return {
    id       : input.id,
    provider : input.provider ?? "deepseek",
    name     : input.name ?? "DeepSeek V3",
    modelId  : input.modelId ?? "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    apiKey   : input.apiKey ?? "enc:v1:cipher",
    isEnabled: true,
    isDefault: input.id === MODEL_IDS.systemDefault,
    updatedAt: new Date("2026-01-01T00:00:00.000Z")
  };
}

/**
 * 被测对象：ModelStrategyResolver。
 * 测试目标：验证阶段模型优先级、参数合并、降级与 fallback 来源标记。
 * 覆盖范围：success / degradation / fallback boundary。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("ModelStrategyResolver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves stage model with JOB > BOOK > GLOBAL > SYSTEM_DEFAULT priority and merges params", async () => {
    // Arrange: 模拟三层策略与系统默认模型。
    const prismaMock = {
      modelStrategyConfig: {
        findFirst: vi.fn(async ({ where }: { where: { scope: string } }) => {
          if (where.scope === "JOB") {
            return {
              stages: {
                [PipelineStage.CHUNK_EXTRACTION]: {
                  modelId        : MODEL_IDS.jobChunk,
                  temperature    : 0.61,
                  maxRetries     : 4,
                  enableThinking : false,
                  reasoningEffort: "high"
                }
              }
            };
          }
          if (where.scope === "BOOK") {
            return {
              stages: {
                [PipelineStage.ROSTER_DISCOVERY]: {
                  modelId        : MODEL_IDS.bookRoster,
                  temperature    : 0.33,
                  enableThinking : true,
                  reasoningEffort: "medium"
                }
              }
            };
          }
          return {
              stages: {
                [PipelineStage.FALLBACK]: {
                  modelId        : MODEL_IDS.globalFallback,
                  retryBaseMs    : 900,
                  enableThinking : true,
                  reasoningEffort: "low"
                }
              }
            };
        })
      },
      aiModel: {
        findMany: vi.fn(async () => ([
          buildModel({ id: MODEL_IDS.jobChunk, name: "Job Chunk Model" }),
          buildModel({ id: MODEL_IDS.bookRoster, name: "Book Roster Model" }),
          buildModel({ id: MODEL_IDS.globalFallback, name: "Global Fallback Model" })
        ])),
        findFirst: vi.fn(async () => buildModel({ id: MODEL_IDS.systemDefault, name: "System Default Model" }))
      }
    };

    const resolver = createModelStrategyResolver(prismaMock as never);

    // Act: 分别解析业务阶段与 fallback 槽位。
    const chunkModel = await resolver.resolveForStage(PipelineStage.CHUNK_EXTRACTION, {
      jobId : "job-1",
      bookId: "book-1"
    });
    expect(chunkModel.modelId).toBe(MODEL_IDS.jobChunk);
    expect(chunkModel.source).toBe("JOB");
    expect(chunkModel.params.temperature).toBe(0.61);
    expect(chunkModel.params.maxRetries).toBe(4);
    expect(chunkModel.params.enableThinking).toBe(false);
    expect(chunkModel.params.reasoningEffort).toBe("high");

    const rosterModel = await resolver.resolveForStage(PipelineStage.ROSTER_DISCOVERY, {
      jobId : "job-1",
      bookId: "book-1"
    });
    expect(rosterModel.modelId).toBe(MODEL_IDS.bookRoster);
    expect(rosterModel.source).toBe("BOOK");
    expect(rosterModel.params.temperature).toBe(0.33);
    expect(rosterModel.params.enableThinking).toBe(true);
    expect(rosterModel.params.reasoningEffort).toBe("medium");

    const fallbackModel = await resolver.resolveFallback({
      jobId : "job-1",
      bookId: "book-1"
    });

    // Assert: 验证优先级命中来源与参数覆盖语义。
    expect(fallbackModel.modelId).toBe(MODEL_IDS.globalFallback);
    expect(fallbackModel.source).toBe("FALLBACK");
    expect(fallbackModel.params.retryBaseMs).toBe(900);
    expect(fallbackModel.params.enableThinking).toBe(true);
    expect(fallbackModel.params.reasoningEffort).toBe("low");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("degrades to system default when configured stage model is missing/disabled", async () => {
    // Arrange: 策略里有 modelId，但模型查询返回空，模拟配置失效。
    const prismaMock = {
      modelStrategyConfig: {
        findFirst: vi.fn(async ({ where }: { where: { scope: string } }) => {
          if (where.scope === "BOOK") {
            return {
              stages: {
                [PipelineStage.CHUNK_EXTRACTION]: {
                  modelId: MODEL_IDS.jobChunk
                }
              }
            };
          }
          return null;
        })
      },
      aiModel: {
        // 配置模型查询为空，模拟模型不存在/禁用，触发自动降级
        findMany : vi.fn(async () => []),
        findFirst: vi.fn(async () => buildModel({ id: MODEL_IDS.systemDefault, name: "System Default Model" }))
      }
    };

    const resolver = createModelStrategyResolver(prismaMock as never);

    // Act
    const resolved = await resolver.resolveForStage(PipelineStage.CHUNK_EXTRACTION, { bookId: "book-1" });

    // Assert
    expect(resolved.modelId).toBe(MODEL_IDS.systemDefault);
    expect(resolved.source).toBe("SYSTEM_DEFAULT");
    expect(resolved.params.enableThinking).toBe(false);
    expect(resolved.params.reasoningEffort).toBeUndefined();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks fallback source as SYSTEM_DEFAULT when fallback slot is not configured", async () => {
    // Arrange: 三层策略都为空，fallback 也未配置。
    const prismaMock = {
      modelStrategyConfig: {
        findFirst: vi.fn(async () => null)
      },
      aiModel: {
        findMany : vi.fn(async () => []),
        findFirst: vi.fn(async () => buildModel({ id: MODEL_IDS.systemDefault, name: "System Default Model" }))
      }
    };

    const resolver = createModelStrategyResolver(prismaMock as never);

    // Act
    const fallback = await resolver.resolveFallback({ bookId: "book-1" });

    // Assert
    expect(fallback.modelId).toBe(MODEL_IDS.systemDefault);
    expect(fallback.source).toBe("SYSTEM_DEFAULT");
    expect(fallback.params.enableThinking).toBe(false);
    expect(fallback.params.reasoningEffort).toBeUndefined();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("accepts glm provider in configured stage model", async () => {
    const prismaMock = {
      modelStrategyConfig: {
        findFirst: vi.fn(async ({ where }: { where: { scope: string } }) => {
          if (where.scope === "GLOBAL") {
            return {
              stages: {
                [PipelineStage.ROSTER_DISCOVERY]: {
                  modelId: MODEL_IDS.bookRoster
                }
              }
            };
          }
          return null;
        })
      },
      aiModel: {
        findMany: vi.fn(async () => ([buildModel({
          id      : MODEL_IDS.bookRoster,
          provider: "glm",
          modelId : "glm-4.6",
          name    : "GLM 4.6"
        })])),
        findFirst: vi.fn(async () => buildModel({ id: MODEL_IDS.systemDefault, name: "System Default Model" }))
      }
    };

    const resolver = createModelStrategyResolver(prismaMock as never);
    const resolved = await resolver.resolveForStage(PipelineStage.ROSTER_DISCOVERY, {});

    expect(resolved.modelId).toBe(MODEL_IDS.bookRoster);
    expect(resolved.provider).toBe("glm");
    expect(resolved.modelName).toBe("glm-4.6");
    expect(resolved.source).toBe("GLOBAL");
    expect(resolved.params.enableThinking).toBe(false);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("uses stage-level thinking defaults when no override is configured", async () => {
    const prismaMock = {
      modelStrategyConfig: {
        findFirst: vi.fn(async () => null)
      },
      aiModel: {
        findMany : vi.fn(async () => []),
        findFirst: vi.fn(async () => buildModel({ id: MODEL_IDS.systemDefault, name: "System Default Model" }))
      }
    };

    const resolver = createModelStrategyResolver(prismaMock as never);

    const titleModel = await resolver.resolveForStage(PipelineStage.TITLE_RESOLUTION, { bookId: "book-1" });
    expect(titleModel.source).toBe("SYSTEM_DEFAULT");
    expect(titleModel.params.enableThinking).toBe(true);
    expect(titleModel.params.reasoningEffort).toBeUndefined();

    const chapterValidationModel = await resolver.resolveForStage(PipelineStage.CHAPTER_VALIDATION, { bookId: "book-1" });
    expect(chapterValidationModel.source).toBe("SYSTEM_DEFAULT");
    expect(chapterValidationModel.params.enableThinking).toBe(false);
    expect(chapterValidationModel.params.reasoningEffort).toBeUndefined();
  });
});
