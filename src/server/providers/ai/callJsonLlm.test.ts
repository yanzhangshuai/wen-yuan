/**
 * 被测对象：callJsonLlm。
 * 测试目标：验证统一 JSON 结构化调用的建客户端 → generateJson → JSON.parse 链路。
 * 覆盖范围：success / 非 JSON 输出报错 / label 前缀。
 */

import { describe, expect, it, vi } from "vitest";

import type { ResolvedFeatureModel } from "@/server/modules/models/defaultModel";

import { callJsonLlm } from "./callJsonLlm";
import { createAiProviderClient } from "./index";

vi.mock("./index", () => ({
  createAiProviderClient: vi.fn()
}));

const MODEL: ResolvedFeatureModel = {
  modelId    : "11111111-1111-4111-8111-111111111111",
  provider   : "deepseek",
  protocol   : "openai-compatible",
  modelName  : "deepseek-chat",
  displayName: "DeepSeek",
  baseUrl    : "https://api.deepseek.com",
  apiKey     : "plain-key",
  params     : { maxRetries: 1, retryBaseMs: 0 }
};

const mockCreateClient = vi.mocked(createAiProviderClient);

describe("callJsonLlm", () => {
  it("creates provider client, generates JSON and parses the result", async () => {
    // Arrange
    mockCreateClient.mockReturnValue({
      generateJson: vi.fn().mockResolvedValue({
        content: '{ "ok": true, "count": 3 }',
        usage  : { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
      })
    } as never);

    // Act
    const result = await callJsonLlm<{ ok: boolean; count: number }>(
      MODEL,
      { system: "s", user: "u" },
      { temperature: 0 }
    );

    // Assert
    expect(mockCreateClient).toHaveBeenCalledWith({
      provider : "deepseek",
      protocol : "openai-compatible",
      apiKey   : "plain-key",
      baseUrl  : "https://api.deepseek.com",
      modelName: "deepseek-chat"
    });
    expect(result).toEqual({
      data : { ok: true, count: 3 },
      usage: { promptTokens: 10, completionTokens: 5, totalTokens: 15 }
    });
  });

  it("throws with the provided label when output is not valid JSON", async () => {
    // Arrange
    mockCreateClient.mockReturnValue({
      generateJson: vi.fn().mockResolvedValue({ content: "not-json", usage: null })
    } as never);

    // Act + Assert
    await expect(callJsonLlm(MODEL, { system: "s", user: "u" }, { label: "identity" }))
      .rejects.toThrow("identity 输出非 JSON");
  });

  it("uses the default label when none is provided", async () => {
    // Arrange
    mockCreateClient.mockReturnValue({
      generateJson: vi.fn().mockResolvedValue({ content: "invalid", usage: null })
    } as never);

    // Act + Assert
    await expect(callJsonLlm(MODEL, { system: "s", user: "u" }))
      .rejects.toThrow("LLM 输出非 JSON");
  });
});
