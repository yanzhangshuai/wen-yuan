import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

/**
 * 功能：实现通义千问 Provider（OpenAI 兼容协议）。
 * 输入：apiKey、baseUrl、modelName。
 * 输出：QwenClient 实例。
 * 异常：缺少 API Key 时抛错。
 * 副作用：无。
 */
export class QwenClient extends OpenAiCompatibleClient {
  constructor(
    apiKey: string,
    baseUrl = "https://dashscope.aliyuncs.com/compatible-mode/v1",
    modelName = "qwen-plus"
  ) {
    super({
      providerName: "Qwen",
      apiKey,
      baseUrl,
      modelName
    });
  }
}
