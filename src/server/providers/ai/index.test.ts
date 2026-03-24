import { describe, expect, it, vi } from "vitest";

import type { AiClientFactory, AiProviderClient } from "@/server/providers/ai";
import { provideAi } from "@/server/providers/ai";

/**
 * 测试只关心 provider 路由行为，因此用最小 client 替身隔离真实网络请求。
 */
function createFakeClient(): AiProviderClient {
  return {
    generateJson: async () => "{}"
  };
}

/**
 * `provideAi` 决定后台最终使用哪一个模型供应商。
 * 这些测试覆盖默认值、大小写归一化和非法 provider 三类核心路由分支。
 */
describe("provideAi", () => {
  it("uses gemini as default provider when provider is empty", () => {
    // Arrange
    const geminiFactory = vi.fn(createFakeClient);
    const deepseekFactory = vi.fn(createFakeClient);
    const qwenFactory = vi.fn(createFakeClient);
    const doubaoFactory = vi.fn(createFakeClient);
    const factories: Record<string, AiClientFactory> = {
      gemini  : geminiFactory,
      deepseek: deepseekFactory,
      qwen    : qwenFactory,
      doubao  : doubaoFactory
    };

    // Act
    provideAi(undefined, factories);

    // Assert
    expect(geminiFactory).toHaveBeenCalledTimes(1);
    expect(deepseekFactory).not.toHaveBeenCalled();
    expect(qwenFactory).not.toHaveBeenCalled();
    expect(doubaoFactory).not.toHaveBeenCalled();
  });

  it("normalizes provider name before routing", () => {
    // Arrange
    const geminiFactory = vi.fn(createFakeClient);
    const deepseekFactory = vi.fn(createFakeClient);
    const qwenFactory = vi.fn(createFakeClient);
    const doubaoFactory = vi.fn(createFakeClient);
    const factories: Record<string, AiClientFactory> = {
      gemini  : geminiFactory,
      deepseek: deepseekFactory,
      qwen    : qwenFactory,
      doubao  : doubaoFactory
    };

    // Act
    provideAi("DEEPSEEK", factories);

    // Assert
    expect(deepseekFactory).toHaveBeenCalledTimes(1);
    expect(geminiFactory).not.toHaveBeenCalled();
    expect(qwenFactory).not.toHaveBeenCalled();
    expect(doubaoFactory).not.toHaveBeenCalled();
  });

  it("routes qwen provider", () => {
    // Arrange
    const qwenFactory = vi.fn(createFakeClient);
    const factories: Record<string, AiClientFactory> = {
      gemini  : createFakeClient,
      deepseek: createFakeClient,
      qwen    : qwenFactory,
      doubao  : createFakeClient
    };

    // Act
    provideAi("qwen", factories);

    // Assert
    expect(qwenFactory).toHaveBeenCalledTimes(1);
  });

  it("routes doubao provider", () => {
    // Arrange
    const doubaoFactory = vi.fn(createFakeClient);
    const factories: Record<string, AiClientFactory> = {
      gemini  : createFakeClient,
      deepseek: createFakeClient,
      qwen    : createFakeClient,
      doubao  : doubaoFactory
    };

    // Act
    provideAi("DOUBAO", factories);

    // Assert
    expect(doubaoFactory).toHaveBeenCalledTimes(1);
  });

  it("throws explicit error for unsupported provider", () => {
    // Arrange
    const factories: Record<string, AiClientFactory> = {
      gemini: createFakeClient
    };

    // Act / Assert
    expect(() => provideAi("unknown", factories)).toThrowError("Unsupported AI_PROVIDER: unknown");
  });
});
