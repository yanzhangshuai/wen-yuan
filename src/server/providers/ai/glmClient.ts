import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

/**
 * 功能：实现 GLM Provider（OpenAI 兼容协议）。
 * 输入：apiKey、baseUrl、modelName。
 * 输出：GlmClient 实例。
 * 异常：缺少 API Key 时抛错。
 * 副作用：无。
 */
export class GlmClient extends OpenAiCompatibleClient {
  constructor(
    apiKey: string,
    baseUrl = "https://open.bigmodel.cn/api/paas/v4",
    modelName = "glm-4.6"
  ) {
    super({
      providerName: "GLM",
      apiKey,
      baseUrl,
      modelName
    });
  }
}
