import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

/**
 * 文件定位（GLM AI 客户端适配器）：
 * - 文件路径：`src/server/providers/ai/glmClient.ts`
 * - 所属层次：服务端 AI Provider 适配层。
 *
 * 业务定位：
 * - 将 GLM 服务注册到统一 Provider 抽象；
 * - 保障上层推理流程可在多厂商间按配置切换。
 *
 * 功能：实现 GLM Provider（OpenAI 兼容协议）。
 * 输入：apiKey、baseUrl、modelName。
 * 输出：GlmClient 实例。
 * 异常：缺少 API Key 时抛错。
 * 副作用：无。
 */
export class GlmClient extends OpenAiCompatibleClient {
  /**
   * @param apiKey GLM 平台访问密钥
   * @param baseUrl GLM 兼容接口基础地址
   * @param modelName 默认模型名
   */
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
