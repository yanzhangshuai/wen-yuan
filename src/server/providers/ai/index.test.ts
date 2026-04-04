import { describe, expect, it } from "vitest";

import { createAiProviderClient } from "@/server/providers/ai";

describe("createAiProviderClient", () => {
  it("creates deepseek provider client from db settings", () => {
    const client = createAiProviderClient({
      provider : "deepseek",
      apiKey   : "test-key",
      baseUrl  : "https://api.deepseek.com",
      modelName: "deepseek-chat"
    });

    expect(client).toBeDefined();
  });

  it("creates qwen provider client from db settings", () => {
    const client = createAiProviderClient({
      provider : "qwen",
      apiKey   : "test-key",
      baseUrl  : "https://dashscope.aliyuncs.com/compatible-mode/v1",
      modelName: "qwen-plus"
    });

    expect(client).toBeDefined();
  });

  it("creates doubao provider client from db settings", () => {
    const client = createAiProviderClient({
      provider : "doubao",
      apiKey   : "test-key",
      baseUrl  : "https://ark.cn-beijing.volces.com/api/v3",
      modelName: "doubao-pro"
    });

    expect(client).toBeDefined();
  });

  it("creates gemini provider client from db settings", () => {
    const client = createAiProviderClient({
      provider : "gemini",
      apiKey   : "test-key",
      modelName: "gemini-3.1-flash"
    });

    expect(client).toBeDefined();
  });

  it("creates glm provider client from db settings", () => {
    const client = createAiProviderClient({
      provider : "glm",
      apiKey   : "test-key",
      baseUrl  : "https://open.bigmodel.cn/api/paas/v4",
      modelName: "glm-4.6"
    });

    expect(client).toBeDefined();
  });
});
