import type { AiGenerateOptions, AiProviderClient } from "@/server/providers/ai";
import type { AiUsage, PromptMessageInput } from "@/types/pipeline";

/**
 * 文件定位（AI Provider 适配层）：
 * - 本文件是“OpenAI 兼容协议”客户端实现，供分析流水线复用。
 * - 属于服务端基础设施层，不是 Next.js 路由文件；被 `createAiProviderClient` 工厂调用。
 *
 * 核心职责：
 * - 用统一请求格式对接不同兼容网关（如各厂商 OpenAI-compatible API）；
 * - 统一抽取文本与 usage 字段，保证上游 `AiProviderClient` 契约稳定；
 * - 在异常场景输出带 providerName 的错误，便于多供应商环境排障。
 */
/**
 * OpenAI 兼容接口的最小响应子集。
 * 这里只声明当前业务真正会读取的字段，避免把第三方协议细节扩散到调用层。
 */
interface OpenAiLikeResponse {
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

/** 把供应商 usage 字段映射到平台统一结构，缺失值统一置 null。 */
function toAiUsage(usage: OpenAiLikeResponse["usage"]): AiUsage {
  return {
    promptTokens    : typeof usage?.prompt_tokens === "number" ? usage.prompt_tokens : null,
    completionTokens: typeof usage?.completion_tokens === "number" ? usage.completion_tokens : null,
    totalTokens     : typeof usage?.total_tokens === "number" ? usage.total_tokens : null
  };
}

/** 兼容 `string` 与“分片数组”两种 content 形态，并在空文本时返回 null。 */
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
 * 统一描述 OpenAI 兼容供应商的接入参数。
 * `providerName` 仅用于错误提示，让不同供应商的故障信息更容易排查。
 */
export interface OpenAiCompatibleConfig {
  /** 供应商名，仅用于错误信息与日志可读性。 */
  providerName: string;
  /** API Key（缺失即抛错，防止以匿名请求误调用生产网关）。 */
  apiKey      : string | undefined;
  /** 兼容网关基地址。 */
  baseUrl     : string;
  /** 默认模型名。 */
  modelName   : string;
}

/**
 * 复用 OpenAI Chat Completions 协议接入兼容供应商。
 * 这样新模型平台只要提供兼容网关，就不需要再为每个厂商单独维护一套请求逻辑。
 */
export class OpenAiCompatibleClient implements AiProviderClient {
  private readonly providerName: string;
  private readonly apiKey      : string;
  private readonly baseUrl     : string;
  private readonly modelName   : string;

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
  async generateJson(
    input: PromptMessageInput,
    options?: AiGenerateOptions
  ): Promise<{ content: string; usage: AiUsage | null }> {
    const messages: Array<{ role: "system" | "user"; content: string }> = [];
    // system 为空时不传，避免给部分兼容网关发送空系统消息导致校验失败。
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
          ? { enable_thinking: options.enableThinking }
          : {}),
        ...(options?.reasoningEffort
          ? { reasoning_effort: options.reasoningEffort }
          : {}),
        response_format: { type: "json_object" },
        messages
      })
    });

    const payload = (await response.json()) as OpenAiLikeResponse;

    if (!response.ok) {
      throw new Error(payload.error?.message ?? `${this.providerName} request failed: ${response.status}`);
    }

    const raw = extractTextContent(payload.choices?.[0]?.message?.content);
    if (!raw) {
      // 兼容网关经常会在限流或协议不完全兼容时返回空 choices，这里显式抛错更容易定位问题。
      throw new Error(`${this.providerName} returned an empty response`);
    }

    return {
      content: raw,
      usage  : toAiUsage(payload.usage)
    };
  }
}
