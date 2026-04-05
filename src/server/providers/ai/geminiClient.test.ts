/**
 * 文件定位（AI Provider 适配层单测）：
 * - 覆盖不同模型供应商客户端封装，位于分析服务与第三方模型 API 之间。
 * - 该层负责统一请求/响应语义，隔离供应商差异，保障上层调用稳定。
 *
 * 业务职责：
 * - 校验鉴权参数、请求体组装、错误映射和响应格式标准化。
 * - 防止供应商 SDK/协议变化直接破坏业务链路。
 */

import { describe, expect, it, vi } from "vitest";

import { GeminiClient } from "@/server/providers/ai/geminiClient";

const hoisted = vi.hoisted(() => ({
  getGenerativeModel: vi.fn(),
  generateContent   : vi.fn(),
  ctor              : vi.fn()
}));

vi.mock("@google/generative-ai", () => {
  class GoogleGenerativeAI {
    constructor(apiKey: string) {
      hoisted.ctor(apiKey);
    }

    getGenerativeModel(options: unknown) {
      hoisted.getGenerativeModel(options);
      return {
        generateContent: hoisted.generateContent
      };
    }
  }

  return { GoogleGenerativeAI };
});

/**
 * 被测对象：GeminiClient。
 * 测试目标：验证 system 指令映射与 usageMetadata 到统一 usage 的转换。
 * 覆盖范围：success。
 */
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("GeminiClient", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("passes system instruction and maps usage metadata", async () => {
    // Arrange
    hoisted.generateContent.mockResolvedValue({
      response: {
        text         : () => "{\"ok\":true}",
        usageMetadata: {
          promptTokenCount    : 90,
          candidatesTokenCount: 30,
          totalTokenCount     : 120
        }
      }
    });

    const client = new GeminiClient("gemini-key", "gemini-3.1-flash");

    // Act
    const result = await client.generateJson(
      {
        system: "你是结构化助手",
        user  : "输出 JSON"
      },
      {
        temperature    : 0.25,
        topP           : 0.95,
        maxOutputTokens: 3000
      }
    );

    // Assert
    expect(hoisted.ctor).toHaveBeenCalledWith("gemini-key");
    expect(hoisted.getGenerativeModel).toHaveBeenCalledWith(expect.objectContaining({
      model            : "gemini-3.1-flash",
      systemInstruction: "你是结构化助手"
    }));
    expect(hoisted.generateContent).toHaveBeenCalledWith(expect.objectContaining({
      contents        : [{ role: "user", parts: [{ text: "输出 JSON" }] }],
      generationConfig: expect.objectContaining({
        temperature    : 0.25,
        topP           : 0.95,
        maxOutputTokens: 3000
      })
    }));
    expect(result).toEqual({
      content: "{\"ok\":true}",
      usage  : {
        promptTokens    : 90,
        completionTokens: 30,
        totalTokens     : 120
      }
    });
  });
});
