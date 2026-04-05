import { DeepSeekClient } from "@/server/providers/ai/deepseekClient";
import { DoubaoClient } from "@/server/providers/ai/doubaoClient";
import { GeminiClient } from "@/server/providers/ai/geminiClient";
import { GlmClient } from "@/server/providers/ai/glmClient";
import { QwenClient } from "@/server/providers/ai/qwenClient";
import type { AiUsage, PromptMessageInput } from "@/types/pipeline";

/**
 * 文件定位（AI Provider 抽象与工厂层）：
 * - 统一定义多模型提供商的调用接口，并按数据库配置创建具体客户端。
 * - 属于后端“基础设施适配层”，在业务服务与第三方 SDK 之间提供稳定边界。
 */

/**
 * 功能：定义通用 AI Provider 抽象接口。
 * 输入：system/user 分离后的 Prompt 结构与可选采样参数。
 * 输出：模型返回的 JSON 文本与 usage。
 * 异常：由具体实现决定。
 * 副作用：由具体实现决定。
 */
export interface AiGenerateOptions {
  /** 采样温度，控制输出发散度。 */
  temperature?    : number;
  /** 输出 token 上限。 */
  maxOutputTokens?: number;
  /** nucleus sampling 参数。 */
  topP?           : number;
  /** 是否启用模型“思考”模式。 */
  enableThinking? : boolean;
  /** 推理强度档位。 */
  reasoningEffort?: "low" | "medium" | "high";
}

export interface AiGenerateResult {
  /** 模型返回原始文本（约定为 JSON 字符串）。 */
  content: string;
  /** 调用用量统计，模型不支持时可为空。 */
  usage  : AiUsage | null;
}

export interface AiProviderClient {
  generateJson(
    input: PromptMessageInput,
    options?: AiGenerateOptions
  ): Promise<AiGenerateResult>;
}

/**
 * 功能：定义内置 AI Provider 名称。
 * 输入：无。
 * 输出：类型约束 AiProviderName。
 * 异常：无。
 * 副作用：无。
 */
export type AiProviderName = "gemini" | "deepseek" | "qwen" | "doubao" | "glm";

/**
 * 功能：定义创建 Provider 客户端所需的运行时配置（来自数据库模型设置）。
 * 输入：无。
 * 输出：类型约束 CreateAiProviderInput。
 * 异常：无。
 * 副作用：无。
 */
export interface CreateAiProviderInput {
  /** Provider 标识，决定实例化哪个 SDK 适配器。 */
  provider : AiProviderName;
  /** 访问密钥（敏感字段，需服务端加密存储）。 */
  apiKey   : string;
  /** 可选自定义网关地址，未配置时使用各厂商默认地址。 */
  baseUrl? : string;
  /** 具体模型名（如 deepseek-chat、qwen-max 等）。 */
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
    // 业务防御：空模型名会导致后续请求落到厂商默认值，风险不可控，因此直接拒绝。
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
    case "glm":
      return new GlmClient(input.apiKey, input.baseUrl ?? "https://open.bigmodel.cn/api/paas/v4", input.modelName);
    default: {
      const exhaustiveCheck: never = input.provider;
      throw new Error(`Unsupported provider: ${String(exhaustiveCheck)}`);
    }
  }
}
