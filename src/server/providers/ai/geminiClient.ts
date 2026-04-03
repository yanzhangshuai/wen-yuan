import { GoogleGenerativeAI } from "@google/generative-ai";

import type { AiGenerateOptions, AiProviderClient } from "@/server/providers/ai";
import type { AiUsage, PromptMessageInput } from "@/types/pipeline";

interface GeminiUsageMetadata {
  promptTokenCount?    : number;
  candidatesTokenCount?: number;
  totalTokenCount?     : number;
}

function toAiUsage(usage: GeminiUsageMetadata | undefined): AiUsage {
  return {
    promptTokens    : typeof usage?.promptTokenCount === "number" ? usage.promptTokenCount : null,
    completionTokens: typeof usage?.candidatesTokenCount === "number" ? usage.candidatesTokenCount : null,
    totalTokens     : typeof usage?.totalTokenCount === "number" ? usage.totalTokenCount : null
  };
}

/**
 * 功能：实现 Gemini Provider，按统一接口生成 JSON 文本。
 * 输入：构造参数（apiKey、modelName）与 generateJson 参数。
 * 输出：模型返回的 JSON 文本。
 * 异常：缺少 API Key、空响应或解析失败时抛错。
 * 副作用：发起外部网络请求到 Gemini 服务。
 */
export class GeminiClient implements AiProviderClient {
  private readonly client   : GoogleGenerativeAI;
  private readonly modelName: string;

  /**
   * 功能：初始化 Gemini 客户端与模型配置。
   * 输入：apiKey - Gemini Key；modelName - 模型名（默认 gemini-3.1-flash）。
   * 输出：GeminiClient 实例。
   * 异常：apiKey 缺失时抛错。
   * 副作用：无。
   */
  constructor(apiKey: string, modelName = "gemini-3.1-flash") {
    if (!apiKey) {
      throw new Error("Missing Gemini API key");
    }

    this.client = new GoogleGenerativeAI(apiKey);
    this.modelName = modelName;
  }

  /**
   * 功能：调用 Gemini 生成 JSON 文本。
   * 输入：system/user Prompt 与可选采样参数。
   * 输出：模型返回的 JSON 文本与 usage。
   * 异常：接口调用失败或空响应时抛错。
   * 副作用：发起外部 API 请求。
   */
  async generateJson(
    input: PromptMessageInput,
    options?: AiGenerateOptions
  ): Promise<{ content: string; usage: AiUsage | null }> {
    // 按当前配置加载模型（默认 gemini-3.1-flash）。
    const model = this.client.getGenerativeModel({
      model            : this.modelName,
      systemInstruction: input.system.trim().length > 0 ? input.system : undefined
    });

    const result = await model.generateContent({
      contents        : [{ role: "user", parts: [{ text: input.user }] }],
      generationConfig: {
        // 强制模型直接返回 JSON 文本，便于后端解析。
        responseMimeType: "application/json",
        // 温度偏低，优先稳定输出而非创造性发挥。
        temperature     : options?.temperature ?? 0.2,
        topP            : options?.topP,
        // 展开输出 token 上限，防止内容被截断。
        maxOutputTokens : options?.maxOutputTokens ?? 8192
      }
    });

    const raw = result.response.text();

    if (!raw) {
      throw new Error("Gemini returned an empty response");
    }

    return {
      content: raw,
      usage  : toAiUsage((result.response as { usageMetadata?: GeminiUsageMetadata }).usageMetadata)
    };
  }
}
