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
 * 功能：定义 AI 客户端工厂函数签名，便于复用与扩展。
 * 输入：无。
 * 输出：AiProviderClient 实例。
 * 异常：由具体工厂实现决定。
 * 副作用：由具体工厂实现决定。
 */
export type AiClientFactory = () => AiProviderClient;

/**
 * 功能：定义内置 AI Provider 名称。
 * 输入：无。
 * 输出：类型约束 AiProviderName。
 * 异常：无。
 * 副作用：无。
 */
export type AiProviderName = "gemini" | "deepseek" | "qwen" | "doubao";

const defaultAiFactories: Record<AiProviderName, AiClientFactory> = {
  gemini: () => new GeminiClient(),
  deepseek: () => new DeepSeekClient(),
  qwen: () => new QwenClient(),
  doubao: () => new DoubaoClient()
};

/**
 * 功能：按 provider 名称创建 AI 客户端实例。
 * 输入：provider - provider 名（默认取 AI_PROVIDER 或 gemini）；factories - 可注入工厂映射。
 * 输出：AiProviderClient 实例。
 * 异常：provider 不受支持时抛错。
 * 副作用：可能触发具体客户端初始化（如环境变量校验）。
 */
export function provideAi(
  provider = process.env.AI_PROVIDER,
  factories: Record<string, AiClientFactory> = defaultAiFactories
): AiProviderClient {
  const normalizedProvider = (provider || "gemini").toLowerCase();
  const factory = factories[normalizedProvider];

  if (!factory) {
    throw new Error(`Unsupported AI_PROVIDER: ${normalizedProvider}`);
  }

  return factory();
}
