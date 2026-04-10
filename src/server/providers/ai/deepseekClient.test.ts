/**
 * 文件定位（AI Provider 适配层单测）：
 * - 覆盖不同模型供应商客户端封装，位于分析服务与第三方模型 API 之间。
 * - 该层负责统一请求/响应语义，隔离供应商差异，保障上层调用稳定。
 *
 * 业务职责：
 * - 校验鉴权参数、请求体组装、错误映射和响应格式标准化。
 * - 防止供应商 SDK/协议变化直接破坏业务链路。
 */

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
// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("DeepSeekClient", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
        maxOutputTokens: 2048,
        enableThinking : false,
        reasoningEffort: "medium"
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
    expect(body.thinking).toEqual({ type: "disabled" });
    expect(body.reasoning_effort).toBeUndefined();

    expect(result).toEqual({
      content: "{\"roles\":[\"A\"]}",
      usage  : {
        promptTokens    : 64,
        completionTokens: 18,
        totalTokens     : 82,
        cacheHitTokens  : null,
        cacheMissTokens : null
      }
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
