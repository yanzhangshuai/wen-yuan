import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

/**
 * 文件定位（通义千问 AI 客户端适配器）：
 * - 文件路径：`src/server/providers/ai/qwenClient.ts`
 * - 所属层次：服务端 AI Provider 适配层。
 *
 * 业务定位：
 * - 把 Qwen 平台纳入统一推理客户端体系；
 * - 保证上层业务使用统一调用协议，降低厂商切换成本。
 *
 * 功能：实现通义千问 Provider（OpenAI 兼容协议）。
 * 输入：apiKey、baseUrl、modelName。
 * 输出：QwenClient 实例。
 * 异常：缺少 API Key 时抛错。
 * 副作用：无。
 */
export class QwenClient extends OpenAiCompatibleClient {
  /**
   * @param apiKey Qwen 平台服务端密钥
   * @param baseUrl Qwen 兼容模式 API 根地址
   * @param modelName 默认模型名
   */
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
