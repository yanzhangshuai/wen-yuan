/**
 * 被测对象：defaultModel（默认模型 + 按 id 解析）。
 * 测试目标：loadSystemDefaultModel / loadModelById 的解析逻辑与异常分支。
 * 覆盖范围：success / 不存在 / 未启用 / API Key 缺失。
 */

import { describe, expect, it, vi } from "vitest";

import { encryptValue } from "@/server/security/encryption";

import {
  DefaultModelError,
  loadModelById,
  loadSystemDefaultModel
} from "./defaultModel";

process.env.APP_ENCRYPTION_KEY = "test-encryption-key";

function makeModelRow(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id       : "model-1",
    provider : "deepseek",
    protocol : "openai-compatible",
    name     : "DeepSeek V3",
    modelId  : "deepseek-chat",
    baseUrl  : "https://api.deepseek.com",
    apiKey   : encryptValue("secret-key"),
    isEnabled: true,
    isDefault: false,
    ...overrides
  };
}

describe("loadSystemDefaultModel", () => {
  it("优先取 isDefault 的启用模型", async () => {
    const findFirst = vi.fn().mockResolvedValue(makeModelRow({ isDefault: true }));
    const model = await loadSystemDefaultModel({ aiModel: { findFirst } } as never);

    expect(model.modelId).toBe("model-1");
    expect(model.apiKey).toBe("secret-key");
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { isEnabled: true, isDefault: true }
    }));
  });

  it("无 isDefault 时取最近更新启用模型", async () => {
    const findFirst = vi.fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(makeModelRow());
    const model = await loadSystemDefaultModel({ aiModel: { findFirst } } as never);

    expect(model.modelId).toBe("model-1");
    expect(findFirst).toHaveBeenCalledTimes(2);
  });

  it("无启用模型时抛 DefaultModelError", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    await expect(loadSystemDefaultModel({ aiModel: { findFirst } } as never))
      .rejects.toThrow(DefaultModelError);
  });

  it("API Key 缺失时抛错", async () => {
    const findFirst = vi.fn().mockResolvedValue(makeModelRow({ apiKey: null }));
    await expect(loadSystemDefaultModel({ aiModel: { findFirst } } as never))
      .rejects.toThrow("未配置 API Key");
  });
});

describe("loadModelById", () => {
  it("按 id 解析启用模型（含解密 Key）", async () => {
    const findUnique = vi.fn().mockResolvedValue(makeModelRow());
    const model = await loadModelById("model-1", { aiModel: { findUnique } } as never);

    expect(model.modelId).toBe("model-1");
    expect(model.apiKey).toBe("secret-key");
    expect(findUnique).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "model-1" }
    }));
  });

  it("模型不存在时抛 DefaultModelError", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    await expect(loadModelById("missing", { aiModel: { findUnique } } as never))
      .rejects.toThrow(DefaultModelError);
  });

  it("模型未启用时抛 DefaultModelError", async () => {
    const findUnique = vi.fn().mockResolvedValue(makeModelRow({ isEnabled: false }));
    await expect(loadModelById("model-1", { aiModel: { findUnique } } as never))
      .rejects.toThrow("模型未启用");
  });
});
