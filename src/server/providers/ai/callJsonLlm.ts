/**
 * 统一 JSON 结构化调用（callJsonLlm）
 * =============================================================================
 * 文件定位：`src/server/providers/ai/callJsonLlm.ts`
 *
 * 职责：
 * - 封装"用某个模型做一次结构化 JSON 调用"的公共步骤：建客户端 → generateJson → JSON.parse；
 * - 消除 identity/llm.ts 与 skills/skillSelector.ts 两处重复的 `createAiProviderClient + generateJson + JSON.parse` 模式；
 * - 解析失败抛带上下文前缀的错误（便于定位是哪个阶段、哪段输出非 JSON）。
 *
 * 设计约束：
 * - 模型配置（ResolvedFeatureModel）已含解密密钥，仅存在于调用链，不落日志；
 * - 非 JSON 输出由调用方抛错，由 AiCallExecutor 统一重试。
 */
import type { ResolvedFeatureModel } from "@/server/modules/models/defaultModel";
import { type AiCallFnResult, type PromptMessageInput } from "@/types/pipeline";

import { createAiProviderClient, type AiGenerateOptions } from "./index";

export interface CallJsonLlmOptions extends AiGenerateOptions {
  /** 错误前缀（如 "identity"、"skill 选择"），用于定位非 JSON 输出来源。 */
  label?: string;
}

/**
 * 功能：用指定模型执行一次结构化 JSON 调用。
 * 输入：模型配置、Prompt 消息、可选生成参数（含错误前缀 label）。
 * 输出：`AiCallFnResult`（data 为解析后的业务对象，usage 为调用用量）。
 * 异常：模型输出非 JSON 时抛 `Error`（内容前缀含 label 便于定位）。
 * 副作用：调用外部 Provider API。
 */
export async function callJsonLlm<TData>(
  model: ResolvedFeatureModel,
  prompt: PromptMessageInput,
  options: CallJsonLlmOptions = {}
): Promise<AiCallFnResult<TData>> {
  const client = createAiProviderClient({
    provider : model.provider,
    protocol : model.protocol,
    apiKey   : model.apiKey,
    baseUrl  : model.baseUrl,
    modelName: model.modelName
  });

  const gen = await client.generateJson(prompt, options);
  const label = options.label ?? "LLM";
  let data: TData;
  try {
    data = JSON.parse(gen.content) as TData;
  } catch {
    throw new Error(`${label} 输出非 JSON: ${gen.content.slice(0, 200)}`);
  }
  return { data, usage: gen.usage };
}
