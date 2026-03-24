import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

/**
 * 功能：实现豆包 Provider（OpenAI 兼容协议）。
 * 输入：apiKey、baseUrl、modelName。
 * 输出：DoubaoClient 实例。
 * 异常：缺少 API Key 时抛错。
 * 副作用：无。
 */
export class DoubaoClient extends OpenAiCompatibleClient {
  constructor(
    apiKey = process.env.DOUBAO_API_KEY,
    baseUrl = process.env.DOUBAO_BASE_URL ?? "https://ark.cn-beijing.volces.com/api/v3",
    modelName = process.env.DOUBAO_MODEL ?? "doubao-pro"
  ) {
    super({
      providerName: "Doubao",
      apiKey,
      baseUrl,
      modelName
    });
  }
}
