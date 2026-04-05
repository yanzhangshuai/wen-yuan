import { GoogleGenerativeAI } from "@google/generative-ai";

import type { AiGenerateOptions, AiProviderClient } from "@/server/providers/ai";
import type { AiUsage, PromptMessageInput } from "@/types/pipeline";

/**
 * 文件定位（AI Provider 适配层 / Gemini）：
 * - 该文件把 Gemini SDK 适配为项目统一的 `AiProviderClient` 协议。
 * - 上游由模型工厂选择并实例化，下游由分析流水线以统一方法 `generateJson` 调用。
 */

interface GeminiUsageMetadata {
  promptTokenCount?    : number;
  candidatesTokenCount?: number;
  totalTokenCount?     : number;
}

/**
 * 把 Gemini 的 usage 字段映射到项目统一结构。
 * 设计原因：不同厂商字段命名不同，统一后才能做跨模型成本对比。
 */
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
      // 早失败：避免创建出“可调用但必失败”的客户端实例。
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

    // SDK 返回的是字符串文本，后续由调用方按 JSON 协议继续解析与校验。
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
