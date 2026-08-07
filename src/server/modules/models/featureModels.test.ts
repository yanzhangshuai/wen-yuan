/**
 * 文件定位（功能点模型服务单测）：
 * - 覆盖 feature_models（功能点 → 模型 全局映射）的运行时解析与管理维护契约。
 * - v5 阶段 4：9 阶段矩阵删除后，模型按功能点（SKILL_SELECTOR / PIPELINE_MAIN / REVIEW）指定。
 *
 * 业务职责：
 * - 验证功能点映射读取（含模型启停过滤）、系统默认回退、upsert 校验与列表输出。
 * - 约束“未配置 → 回退系统默认”的降级语义，避免解析断链。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { PrismaClient } from "@/generated/prisma/client";
import { encryptValue } from "@/server/security/encryption";

import {
  FeatureModelError,
  getFeatureModel,
  listFeatureModels,
  loadSystemDefaultModel,
  upsertFeatureModel
} from "./featureModels";
import { FEATURE_KEYS, FeatureKey } from "@/types/pipeline";

type MockFn = ReturnType<typeof vi.fn>;

/** 本服务消费的最小 prisma 表面（便于注入 mock）。 */
interface FeatureModelsPrismaMock {
  featureModelConfig: {
    findUnique: MockFn;
    findMany  : MockFn;
    upsert    : MockFn;
    deleteMany: MockFn;
  };
  aiModel: {
    findFirst : MockFn;
    findUnique: MockFn;
  };
}

/** 构造最小 AiModel 记录（含可解密的 API Key）。 */
function createAiModelRecord(overrides: Partial<{
  id       : string;
  provider : string;
  protocol : string;
  name     : string;
  modelId  : string;
  baseUrl  : string;
  apiKey   : string | null;
  isEnabled: boolean;
  isDefault: boolean;
}> = {}) {
  return {
    id       : "model-1",
    provider : "deepseek",
    protocol : "openai-compatible",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    apiKey   : encryptValue("plain-secret"),
    isEnabled: true,
    isDefault: false,
    ...overrides
  };
}

function createPrismaMock(overrides: Partial<FeatureModelsPrismaMock> = {}): FeatureModelsPrismaMock {
  return {
    featureModelConfig: {
      findUnique: vi.fn(),
      findMany  : vi.fn(),
      upsert    : vi.fn(),
      deleteMany: vi.fn()
    },
    aiModel: {
      findFirst : vi.fn(),
      findUnique: vi.fn()
    },
    ...overrides
  };
}

/** 把类型安全的 mock 收敛为函数入参期望的 PrismaClient。 */
function asPrisma(mock: FeatureModelsPrismaMock): PrismaClient {
  return mock as unknown as PrismaClient;
}

describe("featureModels service", () => {
  const originalEncryptionKey = process.env.APP_ENCRYPTION_KEY;

  beforeEach(() => {
    // encryptValue/decryptValue 依赖主密钥；测试内固定使用 32 字节测试密钥。
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    vi.clearAllMocks();
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEncryptionKey;
  });

  it("returns null when featureKey is not configured", async () => {
    const prisma = createPrismaMock();
    prisma.featureModelConfig.findUnique.mockResolvedValue(null);

    await expect(getFeatureModel(FeatureKey.SKILL_SELECTOR, asPrisma(prisma))).resolves.toBeNull();
    expect(prisma.featureModelConfig.findUnique).toHaveBeenCalledWith({
      where : { featureKey: FeatureKey.SKILL_SELECTOR },
      select: expect.anything()
    });
  });

  it("returns null when the mapped model is disabled", async () => {
    const prisma = createPrismaMock();
    prisma.featureModelConfig.findUnique.mockResolvedValue({
      modelId: "model-1",
      model  : createAiModelRecord({ isEnabled: false })
    });

    await expect(getFeatureModel(FeatureKey.PIPELINE_MAIN, asPrisma(prisma))).resolves.toBeNull();
  });

  it("returns a resolved model with decrypted apiKey when configured and enabled", async () => {
    const prisma = createPrismaMock();
    prisma.featureModelConfig.findUnique.mockResolvedValue({
      modelId: "model-1",
      model  : createAiModelRecord()
    });

    const resolved = await getFeatureModel(FeatureKey.PIPELINE_MAIN, asPrisma(prisma));

    expect(resolved).toMatchObject({
      modelId    : "model-1",
      provider   : "deepseek",
      protocol   : "openai-compatible",
      modelName  : "deepseek-chat",
      displayName: "DeepSeek V3",
      baseUrl    : "https://api.deepseek.com",
      source     : "FEATURE",
      apiKey     : "plain-secret"
    });
  });

  it("throws when the mapped model has a malformed apiKey", async () => {
    const prisma = createPrismaMock();
    prisma.featureModelConfig.findUnique.mockResolvedValue({
      modelId: "model-1",
      model  : createAiModelRecord({ apiKey: "not-encrypted" })
    });

    await expect(getFeatureModel(FeatureKey.PIPELINE_MAIN, asPrisma(prisma)))
      .rejects.toBeInstanceOf(FeatureModelError);
  });

  it("loads system default model preferring isDefault", async () => {
    const prisma = createPrismaMock();
    prisma.aiModel.findFirst.mockResolvedValue(createAiModelRecord({ id: "default-model" }));

    const resolved = await loadSystemDefaultModel(asPrisma(prisma));

    expect(resolved.modelId).toBe("default-model");
    expect(resolved.source).toBe("SYSTEM_DEFAULT");
  });

  it("falls back to the first enabled model when no default is set", async () => {
    const prisma = createPrismaMock();
    prisma.aiModel.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(createAiModelRecord({ id: "enabled-model" }));

    const resolved = await loadSystemDefaultModel(asPrisma(prisma));

    expect(resolved.modelId).toBe("enabled-model");
    expect(prisma.aiModel.findFirst).toHaveBeenCalledTimes(2);
  });

  it("throws when no enabled model exists", async () => {
    const prisma = createPrismaMock();
    prisma.aiModel.findFirst.mockResolvedValue(null);

    await expect(loadSystemDefaultModel(asPrisma(prisma))).rejects.toThrow("未找到可用模型");
  });

  it("upserts mapping with validation when modelId is provided", async () => {
    const prisma = createPrismaMock();
    prisma.aiModel.findUnique.mockResolvedValue(createAiModelRecord());
    prisma.featureModelConfig.upsert.mockResolvedValue({ featureKey: FeatureKey.REVIEW });

    await upsertFeatureModel(FeatureKey.REVIEW, "model-1", asPrisma(prisma));

    expect(prisma.featureModelConfig.upsert).toHaveBeenCalledWith({
      where : { featureKey: FeatureKey.REVIEW },
      create: { featureKey: FeatureKey.REVIEW, modelId: "model-1" },
      update: { modelId: "model-1" },
      select: { featureKey: true }
    });
  });

  it("rejects upsert when model does not exist", async () => {
    const prisma = createPrismaMock();
    prisma.aiModel.findUnique.mockResolvedValue(null);

    await expect(upsertFeatureModel(FeatureKey.REVIEW, "missing-model", asPrisma(prisma)))
      .rejects.toThrow("功能点模型不存在");
    expect(prisma.featureModelConfig.upsert).not.toHaveBeenCalled();
  });

  it("rejects upsert when model is disabled", async () => {
    const prisma = createPrismaMock();
    prisma.aiModel.findUnique.mockResolvedValue(createAiModelRecord({ isEnabled: false }));

    await expect(upsertFeatureModel(FeatureKey.REVIEW, "model-1", asPrisma(prisma)))
      .rejects.toThrow("功能点模型未启用");
  });

  it("clears the mapping when modelId is null", async () => {
    const prisma = createPrismaMock();

    await upsertFeatureModel(FeatureKey.SKILL_SELECTOR, null, asPrisma(prisma));

    expect(prisma.featureModelConfig.deleteMany).toHaveBeenCalledWith({
      where: { featureKey: FeatureKey.SKILL_SELECTOR }
    });
    expect(prisma.featureModelConfig.upsert).not.toHaveBeenCalled();
  });

  it("lists all featureKeys with unconfigured items marked", async () => {
    const prisma = createPrismaMock();
    prisma.featureModelConfig.findMany.mockResolvedValue([
      {
        featureKey: FeatureKey.PIPELINE_MAIN,
        modelId   : "model-1",
        updatedAt : new Date("2026-08-07T00:00:00.000Z"),
        model     : createAiModelRecord()
      }
    ]);

    const items = await listFeatureModels(asPrisma(prisma));

    expect(items.map((item) => item.featureKey)).toEqual(FEATURE_KEYS);
    expect(items.find((item) => item.featureKey === FeatureKey.PIPELINE_MAIN)).toMatchObject({
      modelId     : "model-1",
      modelName   : "DeepSeek V3",
      provider    : "deepseek",
      isConfigured: true
    });
    expect(items.find((item) => item.featureKey === FeatureKey.SKILL_SELECTOR)).toMatchObject({
      modelId     : null,
      isConfigured: false
    });
  });

  it("marks a mapped featureKey as unconfigured when the model is disabled", async () => {
    const prisma = createPrismaMock();
    prisma.featureModelConfig.findMany.mockResolvedValue([
      {
        featureKey: FeatureKey.PIPELINE_MAIN,
        modelId   : "model-1",
        updatedAt : new Date("2026-08-07T00:00:00.000Z"),
        model     : createAiModelRecord({ isEnabled: false })
      }
    ]);

    const items = await listFeatureModels(asPrisma(prisma));

    expect(items.find((item) => item.featureKey === FeatureKey.PIPELINE_MAIN)).toMatchObject({
      modelId     : null,
      isConfigured: false
    });
  });
});
