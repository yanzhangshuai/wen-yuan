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
describe("GeminiClient", () => {
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
