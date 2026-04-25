/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptValue, encryptValue } from "@/server/security/encryption";

import { createModelsModule } from "./index";

function createAiModelRecord(overrides: Partial<{
  id       : string;
  provider : string;
  name     : string;
  modelId  : string;
  aliasKey : string | null;
  baseUrl  : string;
  apiKey   : string | null;
  isEnabled: boolean;
  isDefault: boolean;
  updatedAt: Date;
}> = {}) {
  return {
    id       : "model-1",
    provider : "deepseek",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    aliasKey : "deepseek-v3-stable",
    baseUrl  : "https://api.deepseek.com",
    apiKey   : null,
    isEnabled: false,
    isDefault: false,
    updatedAt: new Date("2026-03-24T10:00:00.000Z"),
    ...overrides
  };
}

/**
 * 为默认导出包装函数提供隔离的 prisma/fetch 注入：
 * - 包装函数内部会动态 import `@/server/db/prisma`；
 * - 这里在每个用例中重置模块缓存并重新 mock，避免不同用例互相污染。
 */
async function importModelsModuleWithDefaults(prismaMock: unknown, fetchMock?: typeof fetch) {
  vi.resetModules();
  vi.doMock("@/server/db/prisma", () => ({
    prisma: prismaMock
  }));
  vi.stubGlobal("fetch", (fetchMock ?? vi.fn()) as typeof fetch);
  return import("./index");
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("models module", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  const originalModelTestAllowedHosts = process.env.MODEL_TEST_ALLOWED_HOSTS;

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
    process.env.MODEL_TEST_ALLOWED_HOSTS = originalModelTestAllowedHosts;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("lists models with masked api key and isConfigured flag", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";
    const groupByMock = vi.fn()
      .mockResolvedValueOnce([
        { modelId: "model-1", status: "SUCCESS", _count: { _all: 8 } },
        { modelId: "model-1", status: "ERROR", _count: { _all: 2 } },
        { modelId: "model-2", status: "SUCCESS", _count: { _all: 2 } },
        { modelId: "model-2", status: "ERROR", _count: { _all: 4 } }
      ])
      .mockResolvedValueOnce([
        {
          modelId: "model-1",
          _count : { _all: 8 },
          _avg   : {
            durationMs      : 1200,
            promptTokens    : 500,
            completionTokens: 300
          }
        },
        {
          modelId: "model-2",
          _count : { _all: 2 },
          _avg   : {
            durationMs      : 2400,
            promptTokens    : 200,
            completionTokens: 100
          }
        }
      ]);

    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            apiKey   : encryptValue("abcd1234wxyz5678"),
            isDefault: true
          }),
          createAiModelRecord({
            id      : "model-2",
            provider: "glm",
            name    : "GLM 4.6",
            modelId : "glm-4.6",
            apiKey  : null
          })
        ])
      },
      analysisPhaseLog: {
        groupBy: groupByMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.listModels();

    expect(result).toEqual([
      expect.objectContaining({
        id             : "model-1",
        provider       : "deepseek",
        providerModelId: "deepseek-chat",
        aliasKey       : "deepseek-v3-stable",
        apiKeyMasked   : "abcd********5678",
        isConfigured   : true,
        isDefault      : true,
        performance    : {
          callCount          : 10,
          successRate        : 0.8,
          avgLatencyMs       : 1200,
          avgPromptTokens    : 500,
          avgCompletionTokens: 300,
          ratings            : {
            speed    : 5,
            stability: 4,
            cost     : 1
          }
        }
      }),
      expect.objectContaining({
        id             : "model-2",
        provider       : "glm",
        providerModelId: "glm-4.6",
        apiKeyMasked   : null,
        isConfigured   : false,
        performance    : {
          callCount          : 6,
          successRate        : 2 / 6,
          avgLatencyMs       : 2400,
          avgPromptTokens    : 200,
          avgCompletionTokens: 100,
          ratings            : {
            speed    : 1,
            stability: 2,
            cost     : 5
          }
        }
      })
    ]);
    expect(groupByMock).toHaveBeenCalledTimes(2);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty performance snapshot when model has no runtime logs", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            id    : "model-empty",
            apiKey: encryptValue("masked-key")
          })
        ])
      },
      analysisPhaseLog: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.listModels();

    expect(result[0]?.performance).toEqual({
      callCount          : 0,
      successRate        : null,
      avgLatencyMs       : null,
      avgPromptTokens    : null,
      avgCompletionTokens: null,
      ratings            : {
        speed    : 0,
        stability: 0,
        cost     : 0
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("updates model and encrypts api key before persisting", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const updateMock = vi.fn().mockImplementation(async ({ data }: { data: { apiKey?: string } }) => createAiModelRecord({
      baseUrl  : "https://api.example.com",
      apiKey   : data.apiKey ?? null,
      isEnabled: true
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord()),
        update    : updateMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.updateModel({
      id       : "model-1",
      baseUrl  : "https://api.example.com/",
      isEnabled: true,
      apiKey   : {
        action: "set",
        value : "secret-api-key"
      }
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "model-1" },
      data : expect.objectContaining({
        baseUrl  : "https://api.example.com",
        isEnabled: true,
        apiKey   : expect.any(String)
      })
    }));

    const persistedApiKey = updateMock.mock.calls[0][0].data.apiKey as string;
    expect(persistedApiKey).not.toBe("secret-api-key");
    expect(decryptValue(persistedApiKey)).toBe("secret-api-key");
    expect(result.isConfigured).toBe(true);
    expect(result.apiKeyMasked).toBe("secr******-key");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects enabling a model when api key is missing", async () => {
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: null
        })),
        update: vi.fn()
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);

    await expect(modelsModule.updateModel({
      id       : "model-1",
      isEnabled: true,
      apiKey   : { action: "unchanged" }
    })).rejects.toThrow("启用模型前请先配置 API Key");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("clears api key when requested", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const updateMock = vi.fn().mockResolvedValue(createAiModelRecord({
      apiKey   : null,
      isEnabled: false
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey   : encryptValue("secret-api-key"),
          isEnabled: true
        })),
        update: updateMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.updateModel({
      id       : "model-1",
      isEnabled: false,
      apiKey   : { action: "clear" }
    });

    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        isEnabled: false,
        apiKey   : null
      })
    }));
    expect(result.isConfigured).toBe(false);
    expect(result.apiKeyMasked).toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("sets only one default model in a transaction", async () => {
    const findUniqueMock = vi.fn().mockResolvedValue({ id: "model-2" });
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const updateMock = vi.fn().mockResolvedValue(createAiModelRecord({
      id       : "model-2",
      isDefault: true
    }));
    const transactionClient = {
      aiModel: {
        findUnique: findUniqueMock,
        updateMany: updateManyMock,
        update    : updateMock
      }
    };
    const prismaClient = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => {
        return callback(transactionClient);
      })
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.setDefaultModel("model-2");

    expect(updateManyMock).toHaveBeenCalledWith({
      where: { isDefault: true },
      data : { isDefault: false }
    });
    expect(updateMock).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "model-2" },
      data : { isDefault: true }
    }));
    expect(result.id).toBe("model-2");
    expect(result.isDefault).toBe(true);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("tests openai-compatible model connectivity", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id     : "chatcmpl-1",
      choices: [
        {
          message: {
            content: "pong"
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.deepseek.com/chat/completions",
      expect.objectContaining({
        method : "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer secret-api-key"
        })
      })
    );
    expect(result.success).toBe(true);
    expect(result.detail).toBe("连接成功");
    expect(result.errorType).toBeUndefined();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("treats http 200 with provider error payload as failed connectivity", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: "invalid api key"
      }
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("invalid-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("AUTH_ERROR");
    expect(result.errorMessage).toBe("invalid api key");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("treats http 200 without choices as failed connectivity", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id: "chatcmpl-1"
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
    expect(result.errorMessage).toBe("响应缺少 choices，无法确认模型可用");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("tests gemini model connectivity with generateContent endpoint", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: "quota exceeded"
      }
    }), {
      status : 429,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          provider: "gemini",
          modelId : "gemini-2.0-flash",
          baseUrl : "https://generativelanguage.googleapis.com/",
          apiKey  : encryptValue("gemini-secret")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=gemini-secret",
      expect.objectContaining({
        method: "POST"
      })
    );
    expect(result.success).toBe(false);
    expect(result.detail).toBe("quota exceeded");
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
    expect(result.errorMessage).toBe("quota exceeded");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("tests glm model connectivity with openai-compatible endpoint", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      id     : "chatcmpl-glm",
      choices: [
        {
          message: {
            content: "pong"
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          provider: "glm",
          modelId : "glm-4.6",
          baseUrl : "https://open.bigmodel.cn/api/paas/v4/",
          apiKey  : encryptValue("glm-secret")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "https://open.bigmodel.cn/api/paas/v4/chat/completions",
      expect.objectContaining({
        method : "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer glm-secret"
        })
      })
    );
    expect(result.success).toBe(true);
    expect(result.detail).toBe("连接成功");
    expect(result.errorType).toBeUndefined();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws a readable error when api key is missing during connectivity test", async () => {
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: null
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);

    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("模型未配置 API Key");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects connectivity test when base url is a private IP", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn();
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          baseUrl: "https://192.168.1.100",
          apiKey : encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);

    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("连通性测试不允许访问内网地址");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies auth failures as AUTH_ERROR", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      error: {
        message: "invalid api key"
      }
    }), {
      status : 401,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("invalid-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("AUTH_ERROR");
    expect(result.errorMessage).toBe("invalid api key");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when list API detects plaintext api key in storage", async () => {
    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            apiKey: "sk-plaintext"
          })
        ])
      },
      analysisPhaseLog: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.listModels()).rejects.toThrow("非法 API Key 存储格式");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps existing encrypted apiKey when action is unchanged", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const existingApiKey = encryptValue("unchanged-key");
    const updateMock = vi.fn().mockResolvedValue(createAiModelRecord({
      apiKey: existingApiKey
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: existingApiKey
        })),
        update: updateMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await modelsModule.updateModel({
      id    : "model-1",
      apiKey: { action: "unchanged" }
    });

    expect(updateMock).toHaveBeenCalledOnce();
    expect(updateMock.mock.calls[0][0].data.apiKey).toBe(existingApiKey);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("trims provider model id, api key and base url in update payload", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const updateMock = vi.fn().mockResolvedValue(createAiModelRecord({
      modelId: "ep-202604010001",
      baseUrl: "https://api.deepseek.com",
      apiKey : encryptValue("trimmed-key")
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord()),
        update    : updateMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await modelsModule.updateModel({
      providerModelId: "  ep-202604010001  ",
      id             : "model-1",
      baseUrl        : "  https://api.deepseek.com///   ",
      apiKey         : {
        action: "set",
        value : "  trimmed-key   "
      }
    });

    expect(updateMock.mock.calls[0][0].data.modelId).toBe("ep-202604010001");
    expect(updateMock.mock.calls[0][0].data.baseUrl).toBe("https://api.deepseek.com");
    const persistedApiKey = updateMock.mock.calls[0][0].data.apiKey;
    if (typeof persistedApiKey !== "string") {
      throw new Error("expected encrypted api key to be string");
    }
    expect(decryptValue(persistedApiKey)).toBe("trimmed-key");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects update when model record does not exist", async () => {
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(null),
        update    : vi.fn()
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.updateModel({ id: "not-found" })).rejects.toThrow("模型不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects update with empty model id", async () => {
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn(),
        update    : vi.fn()
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.updateModel({ id: "   " })).rejects.toThrow("模型 ID 不能为空");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects setDefaultModel when target model does not exist", async () => {
    const transactionClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
        update    : vi.fn()
      }
    };
    const prismaClient = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => {
        return callback(transactionClient);
      })
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.setDefaultModel("missing-id")).rejects.toThrow("模型不存在");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects setDefaultModel with empty model id", async () => {
    const prismaClient = {
      $transaction: vi.fn()
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.setDefaultModel("   ")).rejects.toThrow("模型 ID 不能为空");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects connectivity test when base url is invalid", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          baseUrl: "not-a-url",
          apiKey : encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("BaseURL 不合法");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects connectivity test when base url is not https", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          baseUrl: "http://api.deepseek.com",
          apiKey : encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("连通性测试仅支持 HTTPS BaseURL");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("allows hosts from MODEL_TEST_ALLOWED_HOSTS env", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";
    process.env.MODEL_TEST_ALLOWED_HOSTS = " INTERNAL.EXAMPLE.com ";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: "pong"
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          baseUrl: "https://internal.example.com",
          apiKey : encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies timeout HTTP statuses as TIMEOUT", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response("gateway timeout", {
      status: 504
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(result.detail).toBe("gateway timeout");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies 404 HTTP status as MODEL_UNAVAILABLE", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response("not found", {
      status: 404
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
    expect(result.detail).toBe("not found");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies unknown HTTP errors as NETWORK_ERROR", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response("bad request", {
      status: 400
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("NETWORK_ERROR");
    expect(result.errorMessage).toBe("bad request");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("extracts detail from top-level message field in JSON error", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      message: "service unavailable"
    }), {
      status : 503,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.detail).toBe("service unavailable");
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to HTTP status detail when JSON parsing fails", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response("not-json-body", {
      status : 502,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.detail).toBe("HTTP 502");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies thrown abort errors as TIMEOUT", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockRejectedValue(new DOMException("aborted", "AbortError"));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(result.errorMessage).toContain("aborted");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies thrown network errors as NETWORK_ERROR", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockRejectedValue(new Error("network down"));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("NETWORK_ERROR");
    expect(result.errorMessage).toBe("network down");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("classifies thrown timeout messages as TIMEOUT", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockRejectedValue(new Error("request timeout from provider"));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("TIMEOUT");
    expect(result.errorMessage).toContain("timeout");
  });

  // 用例语义：OpenAI-compatible 的 content-array 也是有效成功响应，应视为连接成功。
  it("accepts openai-compatible content arrays with text parts", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: [
              null,
              { type: "text", text: "pong" }
            ]
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(true);
    expect(result.detail).toBe("连接成功");
  });

  // 用例语义：200 JSON 若不是 object payload，应落入“无法确认可用”的语义失败分支。
  it("treats null JSON payloads as unavailable model responses", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response("null", {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
    expect(result.errorMessage).toBe("响应不是合法 JSON，无法确认模型可用");
  });

  // 用例语义：choices/message 结构存在但没有可读文本时，应返回稳定的语义错误。
  it("treats payloads without readable content as unavailable", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: { text: "pong" }
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
    expect(result.errorMessage).toBe("响应缺少可读内容，无法确认模型可用");
  });

  // 用例语义：choices 首项不是对象时，应稳态落入“缺少可读内容”的失败分支。
  it("treats non-record choices items as unavailable", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [null]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("响应缺少可读内容，无法确认模型可用");
  });

  // 用例语义：message 缺失时也要返回稳定语义错误，而不是把结构异常冒泡给调用层。
  it("treats choices without message objects as unavailable", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [{}]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorMessage).toBe("响应缺少可读内容，无法确认模型可用");
  });

  // 用例语义：当抛出的并非 Error 实例时，用户仍应看到稳定兜底文案。
  it("falls back to the default message when connectivity throws a non-Error value", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockRejectedValue("boom");
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("NETWORK_ERROR");
    expect(result.errorMessage).toBe("模型连通性测试失败");
  });

  // 用例语义：异常信息包含 fetch 关键字时，也应归类为网络错误而非未知失败。
  it("classifies thrown fetch keyword errors as NETWORK_ERROR", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockRejectedValue(new Error("fetch failed"));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.errorType).toBe("NETWORK_ERROR");
    expect(result.errorMessage).toBe("fetch failed");
  });

  // 用例语义：纯文本错误体若为空，应回退到 HTTP 状态描述，避免前端拿到空文案。
  it("falls back to HTTP status detail for empty text responses", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response("", {
      status : 503,
      headers: {
        "content-type": "text/plain"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(false);
    expect(result.detail).toBe("HTTP 503");
    expect(result.errorType).toBe("MODEL_UNAVAILABLE");
  });

  // 用例语义：额外白名单 env 为空串时，应按“未配置”处理，而不是污染 allowlist 解析。
  it("treats empty MODEL_TEST_ALLOWED_HOSTS as no extra allowlist hosts", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";
    process.env.MODEL_TEST_ALLOWED_HOSTS = "";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: "pong"
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(true);
  });

  // 用例语义：空模型列表不应再继续查询运行日志，避免无意义 groupBy。
  it("returns an empty model list without querying performance logs", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const groupByMock = vi.fn();
    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([])
      },
      analysisPhaseLog: {
        groupBy: groupByMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.listModels();

    expect(result).toEqual([]);
    expect(groupByMock).not.toHaveBeenCalled();
  });

  // 用例语义：日志聚合中偶发的 null modelId 不应污染有效模型的性能统计。
  it("ignores null model ids in performance buckets", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const groupByMock = vi.fn()
      .mockResolvedValueOnce([
        { modelId: null, status: "SUCCESS", _count: { _all: 99 } },
        { modelId: "model-1", status: "SUCCESS", _count: { _all: 3 } }
      ])
      .mockResolvedValueOnce([
        {
          modelId: null,
          _count : { _all: 99 },
          _avg   : {
            durationMs      : 9999,
            promptTokens    : 999,
            completionTokens: 999
          }
        },
        {
          modelId: "model-1",
          _count : { _all: 3 },
          _avg   : {
            durationMs      : 1200,
            promptTokens    : 200,
            completionTokens: 100
          }
        }
      ]);
    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            apiKey: encryptValue("secret-api-key")
          })
        ])
      },
      analysisPhaseLog: {
        groupBy: groupByMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const [result] = await modelsModule.listModels();

    expect(result?.performance.callCount).toBe(3);
    expect(result?.performance.avgLatencyMs).toBe(1200);
  });

  // 用例语义：运行日志均值缺失时，性能快照应输出 null/0，而不是 NaN 或污染评分。
  it("maps null performance averages to stable null and zero ratings", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const groupByMock = vi.fn()
      .mockResolvedValueOnce([
        { modelId: "model-1", status: "SUCCESS", _count: { _all: 1 } }
      ])
      .mockResolvedValueOnce([
        {
          modelId: "model-1",
          _count : { _all: 1 },
          _avg   : {
            durationMs      : null,
            promptTokens    : null,
            completionTokens: null
          }
        }
      ]);
    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            apiKey: encryptValue("secret-api-key")
          })
        ])
      },
      analysisPhaseLog: {
        groupBy: groupByMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const [result] = await modelsModule.listModels();

    expect(result?.performance.avgLatencyMs).toBeNull();
    expect(result?.performance.avgPromptTokens).toBeNull();
    expect(result?.performance.avgCompletionTokens).toBeNull();
    expect(result?.performance.ratings.speed).toBe(0);
    expect(result?.performance.ratings.cost).toBe(0);
  });

  // 用例语义：Gemini 成功探活时不走 OpenAI 语义校验分支，避免误判返回结构。
  it("skips openai semantic validation for successful gemini probes", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ candidates: [] }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          provider: "gemini",
          modelId : "gemini-2.0-flash",
          baseUrl : "https://generativelanguage.googleapis.com/",
          apiKey  : encryptValue("gemini-secret")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);
    const result = await modelsModule.testModelConnectivity("model-1");

    expect(result.success).toBe(true);
    expect(result.detail).toBe("连接成功");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects connectivity test when stored api key is plaintext", async () => {
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: "sk-plaintext"
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("非法 API Key 存储格式");
  });

  // 用例语义：默认导出包装函数应通过动态 prisma 注入走通 listModels/listAdminModels。
  it("delegates list wrappers through the default prisma module", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            apiKey: encryptValue("secret-api-key")
          })
        ])
      },
      analysisPhaseLog: {
        groupBy: vi.fn().mockResolvedValue([])
      }
    };
    const modelsModule = await importModelsModuleWithDefaults(prismaClient);

    const result = await modelsModule.listModels();
    const adminResult = await modelsModule.listAdminModels();

    expect(result).toHaveLength(1);
    expect(adminResult).toHaveLength(1);
    expect(result[0]?.apiKeyMasked).toBe("secr******-key");
  });

  // 用例语义：update wrappers 既要复用默认模块，也要覆盖 admin payload 到 ApiKeyChange 的转换分支。
  it("supports direct and admin update wrappers with all api key mapping modes", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const existingApiKey = encryptValue("existing-secret");
    const updateMock = vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => createAiModelRecord({
      modelId  : typeof data.modelId === "string" ? data.modelId : "deepseek-chat",
      baseUrl  : typeof data.baseUrl === "string" ? data.baseUrl : "https://api.deepseek.com",
      apiKey   : typeof data.apiKey === "string" ? data.apiKey : data.apiKey === null ? null : existingApiKey,
      isEnabled: typeof data.isEnabled === "boolean" ? data.isEnabled : false
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: existingApiKey
        })),
        update: updateMock
      }
    };
    const modelsModule = await importModelsModuleWithDefaults(prismaClient);

    await modelsModule.updateModel({
      id    : "model-1",
      apiKey: {
        action: "set",
        value : "direct-secret"
      }
    });
    await modelsModule.updateAdminModel("model-1", {});
    await modelsModule.updateAdminModel("model-1", { apiKey: "   " });
    await modelsModule.updateAdminModel("model-1", { apiKey: null });
    await modelsModule.updateAdminModel("model-1", { apiKey: "  admin-secret  " });

    const directPersistedApiKey = updateMock.mock.calls[0][0].data.apiKey;
    if (typeof directPersistedApiKey !== "string") {
      throw new Error("expected direct wrapper to persist encrypted api key");
    }

    expect(decryptValue(directPersistedApiKey)).toBe("direct-secret");
    expect(updateMock.mock.calls[1][0].data.apiKey).toBe(existingApiKey);
    expect(updateMock.mock.calls[2][0].data.apiKey).toBe(existingApiKey);
    expect(updateMock.mock.calls[3][0].data.apiKey).toBeNull();

    const adminPersistedApiKey = updateMock.mock.calls[4][0].data.apiKey;
    if (typeof adminPersistedApiKey !== "string") {
      throw new Error("expected admin wrapper to persist encrypted api key");
    }
    expect(decryptValue(adminPersistedApiKey)).toBe("admin-secret");
  });

  // 用例语义：当 payload 省略 apiKey 时，不应把旧值重复写回数据库。
  it("omits apiKey patch when update payload does not include apiKey", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const updateMock = vi.fn().mockResolvedValue(createAiModelRecord({
      apiKey: encryptValue("existing-secret")
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("existing-secret")
        })),
        update: updateMock
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await modelsModule.updateModel({
      id       : "model-1",
      isEnabled: false
    });

    expect(updateMock.mock.calls[0][0].data).not.toHaveProperty("apiKey");
  });

  // 用例语义：default/admin 的默认模型包装函数都应复用同一事务逻辑。
  it("delegates default-model wrappers through the default prisma module", async () => {
    const findUniqueMock = vi.fn().mockResolvedValue({ id: "model-1" });
    const updateManyMock = vi.fn().mockResolvedValue({ count: 1 });
    const updateMock = vi.fn().mockResolvedValue(createAiModelRecord({
      isDefault: true
    }));
    const transactionClient = {
      aiModel: {
        findUnique: findUniqueMock,
        updateMany: updateManyMock,
        update    : updateMock
      }
    };
    const prismaClient = {
      $transaction: vi.fn().mockImplementation(async (callback: (tx: typeof transactionClient) => Promise<unknown>) => {
        return callback(transactionClient);
      })
    };
    const modelsModule = await importModelsModuleWithDefaults(prismaClient);

    const directResult = await modelsModule.setDefaultModel("model-1");
    const adminResult = await modelsModule.setDefaultAdminModel("model-1");

    expect(directResult.isDefault).toBe(true);
    expect(adminResult.isDefault).toBe(true);
    expect(updateManyMock).toHaveBeenCalledTimes(2);
  });

  // 用例语义：default/admin 的连通性包装函数都应透传到底层探活逻辑。
  it("delegates connectivity wrappers through the default prisma module", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn().mockImplementation(async () => new Response(JSON.stringify({
      choices: [
        {
          message: {
            content: "pong"
          }
        }
      ]
    }), {
      status : 200,
      headers: {
        "content-type": "application/json"
      }
    }));
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          apiKey: encryptValue("secret-api-key")
        }))
      }
    };
    const modelsModule = await importModelsModuleWithDefaults(prismaClient, fetchMock as typeof fetch);

    const directResult = await modelsModule.testModelConnectivity("model-1");
    const adminResult = await modelsModule.testAdminModelConnection("model-1");

    expect(directResult.success).toBe(true);
    expect(adminResult.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("creates a new model with encrypted api key and returns ModelListItem", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const createdRecord = createAiModelRecord({
      id      : "new-model-id",
      provider: "openai",
      name    : "GPT-4o",
      modelId : "gpt-4o",
      baseUrl : "https://api.openai.com",
      apiKey  : encryptValue("sk-test-key")
    });

    const prismaClient = {
      aiModel: {
        create: vi.fn().mockResolvedValue(createdRecord)
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);

    const result = await modelsModule.createModel({
      provider       : "openai",
      name           : "GPT-4o",
      providerModelId: "gpt-4o",
      baseUrl        : "https://api.openai.com",
      apiKey         : "sk-test-key"
    });

    expect(result.id).toBe("new-model-id");
    expect(result.provider).toBe("openai");
    expect(result.name).toBe("GPT-4o");
    expect(result.providerModelId).toBe("gpt-4o");
    expect(result.isEnabled).toBe(false);
    expect(result.isDefault).toBe(false);
    expect(result.isConfigured).toBe(true);

    const createCall = (prismaClient as { aiModel: { create: ReturnType<typeof vi.fn> } }).aiModel.create;
    expect(createCall).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        provider : "openai",
        name     : "GPT-4o",
        modelId  : "gpt-4o",
        baseUrl  : "https://api.openai.com",
        isEnabled: false,
        isDefault: false,
        aliasKey : null
      })
    }));

    // API key must be stored encrypted, not plaintext
    const storedApiKey: string = createCall.mock.calls[0][0].data.apiKey;
    expect(storedApiKey).toMatch(/^enc:v1:/);
    expect(decryptValue(storedApiKey)).toBe("sk-test-key");
  });

  it("creates a model without api key when apiKey is omitted", async () => {
    const createdRecord = createAiModelRecord({
      id     : "new-model-no-key",
      apiKey : null,
      baseUrl: "https://api.custom.com"
    });

    const prismaClient = {
      aiModel: {
        create: vi.fn().mockResolvedValue(createdRecord)
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);

    const result = await modelsModule.createModel({
      provider       : "custom",
      name           : "Custom Model",
      providerModelId: "custom-v1",
      baseUrl        : "https://api.custom.com"
    });

    expect(result.isConfigured).toBe(false);
    expect(result.apiKeyMasked).toBeNull();

    const createCall = (prismaClient as { aiModel: { create: ReturnType<typeof vi.fn> } }).aiModel.create;
    expect(createCall.mock.calls[0][0].data.apiKey).toBeNull();
  });

  it("throws when creating a model with missing required fields", async () => {
    const prismaClient = { aiModel: { create: vi.fn() } } as never;
    const modelsModule = createModelsModule(prismaClient);

    await expect(modelsModule.createModel({
      provider       : "",
      name           : "Bad Model",
      providerModelId: "model-id",
      baseUrl        : "https://api.example.com"
    })).rejects.toThrow("供应商不能为空");
  });

  it("deletes a model by id", async () => {
    const prismaClient = {
      aiModel: {
        delete: vi.fn().mockResolvedValue(undefined)
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    await modelsModule.deleteModel("model-1");

    expect((prismaClient as { aiModel: { delete: ReturnType<typeof vi.fn> } }).aiModel.delete)
      .toHaveBeenCalledWith({ where: { id: "model-1" } });
  });

  it("throws when deleting with an empty id", async () => {
    const prismaClient = { aiModel: { delete: vi.fn() } } as never;
    const modelsModule = createModelsModule(prismaClient);

    await expect(modelsModule.deleteModel("")).rejects.toThrow("模型 ID 不能为空");
  });
});
