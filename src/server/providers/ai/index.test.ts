import { describe, expect, it, vi } from "vitest";

import type { AiClientFactory, AiProviderClient } from "@/server/providers/ai";
import { provideAi } from "@/server/providers/ai";

function createFakeClient(): AiProviderClient {
  return {
    generateJson: async () => "{}"
  };
}

describe("provideAi", () => {
  it("uses gemini as default provider when provider is empty", () => {
    const geminiFactory = vi.fn(createFakeClient);
    const deepseekFactory = vi.fn(createFakeClient);
    const factories: Record<string, AiClientFactory> = {
      gemini: geminiFactory,
      deepseek: deepseekFactory
    };

    provideAi(undefined, factories);

    expect(geminiFactory).toHaveBeenCalledTimes(1);
    expect(deepseekFactory).not.toHaveBeenCalled();
  });

  it("normalizes provider name before routing", () => {
    const geminiFactory = vi.fn(createFakeClient);
    const deepseekFactory = vi.fn(createFakeClient);
    const factories: Record<string, AiClientFactory> = {
      gemini: geminiFactory,
      deepseek: deepseekFactory
    };

    provideAi("DEEPSEEK", factories);

    expect(deepseekFactory).toHaveBeenCalledTimes(1);
    expect(geminiFactory).not.toHaveBeenCalled();
  });

  it("throws explicit error for unsupported provider", () => {
    const factories: Record<string, AiClientFactory> = {
      gemini: createFakeClient
    };

    expect(() => provideAi("unknown", factories)).toThrowError("Unsupported AI_PROVIDER: unknown");
  });
});
