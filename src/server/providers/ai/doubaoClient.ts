import { OpenAiCompatibleClient } from "@/server/providers/ai/openaiCompatibleClient";

/**
 * 文件定位（豆包 AI 客户端适配器）：
 * - 文件路径：`src/server/providers/ai/doubaoClient.ts`
 * - 所属层次：服务端 AI Provider 适配层。
 *
 * 业务定位：
 * - 把豆包平台接入到项目统一的 OpenAI 兼容抽象中；
 * - 让上层业务仅依赖统一接口，而非耦合各厂商 SDK 细节。
 *
 * 功能：实现豆包 Provider（OpenAI 兼容协议）。
 * 输入：apiKey、baseUrl、modelName。
 * 输出：DoubaoClient 实例。
 * 异常：缺少 API Key 时抛错。
 * 副作用：无。
 */
export class DoubaoClient extends OpenAiCompatibleClient {
  /**
   * @param apiKey 来自环境变量或密钥管理系统的服务端凭据
   * @param baseUrl 豆包 OpenAI 兼容接口基础地址（默认官方地址）
   * @param modelName 默认模型名，未显式指定时走项目基线模型
   */
  constructor(
    apiKey: string,
    baseUrl = "https://ark.cn-beijing.volces.com/api/v3",
    modelName = "doubao-pro"
  ) {
    super({
      providerName: "Doubao",
      apiKey,
      baseUrl,
      modelName
    });
  }
}
