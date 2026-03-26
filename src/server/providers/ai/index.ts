import { DeepSeekClient } from "@/server/providers/ai/deepseekClient";
import { DoubaoClient } from "@/server/providers/ai/doubaoClient";
import { GeminiClient } from "@/server/providers/ai/geminiClient";
import { QwenClient } from "@/server/providers/ai/qwenClient";

/**
 * 功能：定义通用 AI Provider 抽象接口。
 * 输入：prompt 字符串。
 * 输出：模型返回的 JSON 文本。
 * 异常：由具体实现决定。
 * 副作用：由具体实现决定。
 */
export interface AiProviderClient {
  generateJson(prompt: string): Promise<string>;
}

/**
 * 功能：定义内置 AI Provider 名称。
 * 输入：无。
 * 输出：类型约束 AiProviderName。
 * 异常：无。
 * 副作用：无。
 */
export type AiProviderName = "gemini" | "deepseek" | "qwen" | "doubao";

/**
 * 功能：定义创建 Provider 客户端所需的运行时配置（来自数据库模型设置）。
 * 输入：无。
 * 输出：类型约束 CreateAiProviderInput。
 * 异常：无。
 * 副作用：无。
 */
export interface CreateAiProviderInput {
  provider : AiProviderName;
  apiKey   : string;
  baseUrl? : string;
  modelName: string;
}

/**
 * 功能：按数据库中的模型配置创建 AI 客户端实例。
 * 输入：provider/apiKey/baseUrl/modelName。
 * 输出：AiProviderClient 实例。
 * 异常：provider 不受支持或关键参数缺失时抛错。
 * 副作用：无（仅创建客户端对象，不发请求）。
 */
export function createAiProviderClient(input: CreateAiProviderInput): AiProviderClient {
  if (!input.modelName.trim()) {
    throw new Error("模型标识不能为空");
  }

  switch (input.provider) {
    case "gemini":
      return new GeminiClient(input.apiKey, input.modelName);
    case "deepseek":
      return new DeepSeekClient(input.apiKey, input.baseUrl ?? "https://api.deepseek.com", input.modelName);
    case "qwen":
      return new QwenClient(
        input.apiKey,
        input.baseUrl ?? "https://dashscope.aliyuncs.com/compatible-mode/v1",
        input.modelName
      );
    case "doubao":
      return new DoubaoClient(input.apiKey, input.baseUrl ?? "https://ark.cn-beijing.volces.com/api/v3", input.modelName);
    default: {
      const exhaustiveCheck: never = input.provider;
      throw new Error(`Unsupported provider: ${String(exhaustiveCheck)}`);
    }
  }
}
