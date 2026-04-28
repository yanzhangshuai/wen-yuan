/**
 * 文件定位（AI Provider 适配层单测）：
 * - 覆盖不同模型供应商客户端封装，位于分析服务与第三方模型 API 之间。
 * - 该层负责统一请求/响应语义，隔离供应商差异，保障上层调用稳定。
 *
 * 业务职责：
 * - 校验鉴权参数、请求体组装、错误映射和响应格式标准化。
 * - 防止供应商 SDK/协议变化直接破坏业务链路。
 */

import { describe, expect, it } from "vitest";

import { createAiProviderClient } from "@/server/providers/ai";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("createAiProviderClient", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates openai-compatible client by protocol even with custom provider", () => {
    const client = createAiProviderClient({
      protocol : "openai-compatible",
      provider : "custom-gateway",
      apiKey   : "test-key",
      baseUrl  : "https://gateway.example.com/v1",
      modelName: "custom-model"
    });

    expect(client).toBeDefined();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates gemini client by protocol", () => {
    const client = createAiProviderClient({
      protocol : "gemini",
      provider : "gemini",
      apiKey   : "test-key",
      modelName: "gemini-3.1-flash"
    });

    expect(client).toBeDefined();
  });

  it("rejects unsupported protocol", () => {
    expect(() => createAiProviderClient({
      protocol : "anthropic",
      provider : "custom",
      apiKey   : "test-key",
      modelName: "claude"
    } as never)).toThrow("Unsupported provider protocol");
  });

  it("rejects empty model name", () => {
    expect(() => createAiProviderClient({
      protocol : "openai-compatible",
      provider : "deepseek",
      apiKey   : "test-key",
      baseUrl  : "https://api.deepseek.com",
      modelName: " "
    })).toThrow("模型标识不能为空");
  });

  it("requires baseUrl for openai-compatible protocol", () => {
    expect(() => createAiProviderClient({
      protocol : "openai-compatible",
      provider : "custom",
      apiKey   : "test-key",
      modelName: "custom"
    })).toThrow("OpenAI 兼容协议 BaseURL 不能为空");
  });
});
