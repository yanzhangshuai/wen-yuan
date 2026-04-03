import { afterEach, describe, expect, it, vi } from "vitest";

import { DeepSeekClient } from "@/server/providers/ai/deepseekClient";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

/**
 * 被测对象：DeepSeekClient。
 * 测试目标：验证 system/user prompt 组装与 usage 映射，以及 provider 错误透传。
 * 覆盖范围：success / provider-level failure。
 */
describe("DeepSeekClient", () => {
  it("sends system/user messages and maps usage", async () => {
    // Arrange
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        choices: [{ message: { content: "{\"roles\":[\"A\"]}" } }],
        usage  : {
          prompt_tokens    : 64,
          completion_tokens: 18,
          total_tokens     : 82
        }
      }), {
        status : 200,
        headers: { "content-type": "application/json" }
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    const client = new DeepSeekClient("key-1", "https://api.deepseek.com", "deepseek-chat");

    // Act
    const result = await client.generateJson(
      {
        system: "你是测试助手",
        user  : "只输出 JSON"
      },
      {
        temperature    : 0.2,
        topP           : 1,
        maxOutputTokens: 2048
      }
    );

    // Assert
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.messages).toEqual([
      { role: "system", content: "你是测试助手" },
      { role: "user", content: "只输出 JSON" }
    ]);
    expect(body.max_tokens).toBe(2048);

    expect(result).toEqual({
      content: "{\"roles\":[\"A\"]}",
      usage  : {
        promptTokens    : 64,
        completionTokens: 18,
        totalTokens     : 82
      }
    });
  });

  it("throws readable error for provider-level failure", async () => {
    // Arrange
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify({
        error: {
          message: "rate limit"
        }
      }), {
        status : 429,
        headers: { "content-type": "application/json" }
      })
    ));

    const client = new DeepSeekClient("key-1", "https://api.deepseek.com", "deepseek-chat");

    // Act + Assert
    await expect(client.generateJson({ system: "", user: "hello" })).rejects.toThrow("rate limit");
  });
});
