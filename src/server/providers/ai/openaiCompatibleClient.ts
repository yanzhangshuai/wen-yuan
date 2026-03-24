import type { AiProviderClient } from "@/server/providers/ai";

/**
 * OpenAI 兼容接口的最小响应子集。
 * 这里只声明当前业务真正会读取的字段，避免把第三方协议细节扩散到调用层。
 */
interface OpenAiLikeResponse {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
  error?: {
    message?: string;
  };
}

/**
 * 统一描述 OpenAI 兼容供应商的接入参数。
 * `providerName` 仅用于错误提示，让不同供应商的故障信息更容易排查。
 */
export interface OpenAiCompatibleConfig {
  providerName: string;
  apiKey: string | undefined;
  baseUrl: string;
  modelName: string;
}

/**
 * 复用 OpenAI Chat Completions 协议接入兼容供应商。
 * 这样新模型平台只要提供兼容网关，就不需要再为每个厂商单独维护一套请求逻辑。
 */
export class OpenAiCompatibleClient implements AiProviderClient {
  private readonly providerName: string;
  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly modelName: string;

  constructor(config: OpenAiCompatibleConfig) {
    if (!config.apiKey) {
      throw new Error(`Missing ${config.providerName} API key`);
    }

    this.providerName = config.providerName;
    this.apiKey = config.apiKey;
    // 统一移除尾部斜杠，避免后续路径拼接出现 `//chat/completions`。
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.modelName = config.modelName;
  }

  /**
   * 强制供应商返回 JSON 字符串，保持各 Provider 在上层分析流程中的输出契约一致。
   */
  async generateJson(prompt: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: this.modelName,
        temperature: 0.2,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: prompt }]
      })
    });

    const payload = (await response.json()) as OpenAiLikeResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `${this.providerName} request failed: ${response.status}`);
    }

    const raw = payload.choices?.[0]?.message?.content;
    if (!raw) {
      // 兼容网关经常会在限流或协议不完全兼容时返回空 choices，这里显式抛错更容易定位问题。
      throw new Error(`${this.providerName} returned an empty response`);
    }

    return raw;
  }
}
