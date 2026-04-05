import type { AiGenerateOptions, AiProviderClient } from "@/server/providers/ai";
import type { AiUsage, PromptMessageInput } from "@/types/pipeline";

/**
 * 文件定位（AI Provider 适配层）：
 * - 本文件封装 DeepSeek 的 Chat Completions 调用方式，对上层暴露统一 `AiProviderClient`。
 * - 属于服务端基础设施代码，被分析流水线（ChapterAnalysis/Validation）间接调用。
 *
 * 核心职责：
 * - 将业务统一输入（system/user prompt + options）转换为 DeepSeek 协议请求；
 * - 统一返回 `content + usage`，与其他 provider 保持同构；
 * - 对空响应、HTTP 失败做显式抛错，避免上游静默吞错。
 */
interface DeepSeekChatResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ text?: string; type?: string }>;
    };
  }>;
  usage?: {
    prompt_tokens?    : number;
    completion_tokens?: number;
    total_tokens?     : number;
  };
  error?: {
    message?: string;
  };
}

/** usage 字段统一映射，缺失项返回 null，便于上层成本统计。 */
function toAiUsage(usage: DeepSeekChatResponse["usage"]): AiUsage {
  return {
    promptTokens    : typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
    totalTokens     : typeof usage?.total_tokens === "number" ? usage.total_tokens : null
  };
}

/** 抽取模型回复文本，兼容 `string` 和分段数组两种返回格式。 */
function extractTextContent(content: string | Array<{ text?: string; type?: string }> | undefined): string | null {
  if (typeof content === "string") {
    const text = content.trim();
    return text.length > 0 ? text : null;
  }

  if (!Array.isArray(content)) {
    return null;
  }

  const text = content
    .map((part) => (typeof part.text === "string" ? part.text : ""))
    .join("")
    .trim();
  return text.length > 0 ? text : null;
}

/**
 * 功能：实现 DeepSeek Provider，按统一接口生成 JSON 文本。
 * 输入：构造参数（apiKey、baseUrl、modelName）与 generateJson 参数。
 * 输出：模型返回的 JSON 文本。
 * 异常：缺少 API Key、接口失败、空响应或解析失败时抛错。
 * 副作用：发起外部网络请求到 DeepSeek 服务。
 */
export class DeepSeekClient implements AiProviderClient {
  private readonly apiKey   : string;
  private readonly baseUrl  : string;
  private readonly modelName: string;

  /**
   * 功能：初始化 DeepSeek 客户端配置。
   * 输入：apiKey、baseUrl、modelName。
   * 输出：DeepSeekClient 实例。
   * 异常：apiKey 缺失时抛错。
   * 副作用：无。
   */
  constructor(
    apiKey: string,
    baseUrl = "https://api.deepseek.com",
    modelName = "deepseek-chat"
  ) {
    if (!apiKey) {
      throw new Error("Missing DeepSeek API key");
    }

    this.apiKey = apiKey;
    this.baseUrl = baseUrl.replace(/\/+$/, "");
    this.modelName = modelName;
  }

  /**
   * 功能：调用 DeepSeek 生成 JSON 文本。
   * 输入：system/user Prompt 与可选采样参数。
   * 输出：模型返回的 JSON 文本与 usage。
   * 异常：接口调用失败或空响应时抛错。
   * 副作用：发起外部 API 请求。
   */
  async generateJson(input: PromptMessageInput, options?: AiGenerateOptions): Promise<{ content: string; usage: AiUsage | null }> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    // 空 system prompt 不发送，避免兼容网关对空字段行为不一致。
    if (input.system.trim().length > 0) {
      messages.push({ role: "system", content: input.system });
    }
    messages.push({ role: "user", content: input.user });

    const response = await fetch(`${this.baseUrl}/chat/completions`, {
      method : "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization : `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model      : this.modelName,
        temperature: options?.temperature ?? 0.2,
        top_p      : options?.topP,
        max_tokens : options?.maxOutputTokens ?? 8192,
        ...(typeof options?.enableThinking === "boolean"
          ? {
              thinking: {
                type: options.enableThinking ? "enabled" : "disabled"
              }
            }
          : {}),
        response_format: { type: "json_object" },
        messages
      })
    });

    const payload = (await response.json()) as DeepSeekChatResponse;

    if (!response.ok) {
      const message = payload.error?.message ?? `DeepSeek request failed: ${response.status}`;
      throw new Error(message);
    }

    const raw = extractTextContent(payload.choices?.[0]?.message?.content);

    if (!raw) {
      throw new Error("DeepSeek returned an empty response");
    }

    return {
      content: raw,
      usage  : toAiUsage(payload.usage)
    };
  }
}
