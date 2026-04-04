import { afterEach, describe, expect, it, vi } from "vitest";

import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * 被测对象：OpenAiCompatibleClient。
 * 测试目标：验证标准 system/user 消息拼装、采样参数透传与 usage 映射。
 * 覆盖范围：success / empty-content failure。
 */
describe("OpenAiCompatibleClient", () => {
  it("sends system/user messages and maps usage", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"ok\":true}" } }],
        usage  : {
          prompt_tokens    : 120,
          completion_tokens: 45,
          total_tokens     : 165
        }
      }), {
        status : 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiCompatibleClient({
      providerName: "Qwen",
      apiKey      : "test-key",
      baseUrl     : "https://example.com/v1",
      modelName   : "qwen-plus"
    });

    // Act
    const result = await client.generateJson(
      {
        system: "system role",
        user  : "请输出 JSON"
      },
      {
        temperature    : 0.35,
        topP           : 0.9,
        maxOutputTokens: 4096,
        enableThinking : true,
        reasoningEffort: "high"
      }
    );

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "system role" },
      { role: "user", content: "请输出 JSON" }
    ]);
    expect(body.temperature).toBe(0.35);
    expect(body.top_p).toBe(0.9);
    expect(body.max_tokens).toBe(4096);
    expect(body.enable_thinking).toBe(true);
    expect(body.reasoning_effort).toBe("high");

    expect(result).toEqual({
      content: "{\"ok\":true}",
      usage  : {
        promptTokens    : 120,
        completionTokens: 45,
        totalTokens     : 165
      }
    });
  });

  it("throws readable error for empty content", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ choices: [{ message: {} }] }), {
        status : 200,
        headers: { "content-type": "application/json" }
      })
    ));

    const client = new OpenAiCompatibleClient({
      providerName: "Doubao",
      apiKey      : "test-key",
      baseUrl     : "https://example.com/v1",
      modelName   : "doubao-pro"
    });

    // Act + Assert
    await expect(client.generateJson({ system: "", user: "hello" })).rejects.toThrow("returned an empty response");
  });

  it("does not send reasoning_effort when not explicitly configured", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"ok\":true}" } }],
        usage  : {
          prompt_tokens    : 10,
          completion_tokens: 5,
          total_tokens     : 15
        }
      }), {
        status : 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new OpenAiCompatibleClient({
      providerName: "Qwen",
      apiKey      : "test-key",
      baseUrl     : "https://example.com/v1",
      modelName   : "qwen-plus"
    });

    // Act
    await client.generateJson(
      {
        system: "system role",
        user  : "请输出 JSON"
      },
      {
        temperature    : 0.2,
        topP           : 1,
        maxOutputTokens: 1024,
        enableThinking : true
      }
    );

    // Assert
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.enable_thinking).toBe(true);
    expect(body.reasoning_effort).toBeUndefined();
  });
});
