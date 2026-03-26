import { afterEach, describe, expect, it, vi } from "vitest";

import { decryptValue, encryptValue } from "@/server/security/encryption";

import { createModelsModule } from "./index";

function createAiModelRecord(overrides: Partial<{
  id       : string;
  provider : string;
  name     : string;
  modelId  : string;
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
    baseUrl  : "https://api.deepseek.com",
    apiKey   : null,
    isEnabled: false,
    isDefault: false,
    updatedAt: new Date("2026-03-24T10:00:00.000Z"),
    ...overrides
  };
}

describe("models module", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;
  const originalModelTestAllowedHosts = process.env.MODEL_TEST_ALLOWED_HOSTS;

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
    process.env.MODEL_TEST_ALLOWED_HOSTS = originalModelTestAllowedHosts;
    vi.restoreAllMocks();
  });

  it("lists models with masked api key and isConfigured flag", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const prismaClient = {
      aiModel: {
        findMany: vi.fn().mockResolvedValue([
          createAiModelRecord({
            apiKey   : encryptValue("abcd1234wxyz5678"),
            isDefault: true
          }),
          createAiModelRecord({
            id      : "model-2",
            provider: "gemini",
            name    : "Gemini Flash",
            modelId : "gemini-2.0-flash",
            apiKey  : null
          })
        ])
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient);
    const result = await modelsModule.listModels();

    expect(result).toEqual([
      expect.objectContaining({
        id          : "model-1",
        provider    : "deepseek",
        apiKeyMasked: "abcd********5678",
        isConfigured: true,
        isDefault   : true
      }),
      expect.objectContaining({
        id          : "model-2",
        provider    : "gemini",
        apiKeyMasked: null,
        isConfigured: false
      })
    ]);
  });

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

  it("tests openai-compatible model connectivity", async () => {
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

  it("rejects connectivity test when base url host is not in allowlist", async () => {
    process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

    const fetchMock = vi.fn();
    const prismaClient = {
      aiModel: {
        findUnique: vi.fn().mockResolvedValue(createAiModelRecord({
          baseUrl: "https://internal.example.com",
          apiKey : encryptValue("secret-api-key")
        }))
      }
    } as never;

    const modelsModule = createModelsModule(prismaClient, fetchMock);

    await expect(modelsModule.testModelConnectivity("model-1")).rejects.toThrow("连通性测试地址不在白名单内");
    expect(fetchMock).not.toHaveBeenCalled();
  });

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
});
