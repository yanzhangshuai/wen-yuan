/**
 * identity 模块 LLM 调用封装。
 *
 * 正确调用链（v5 复用 AiCallExecutor）：
 *   aiCallExecutor.execute({ stage, prompt, jobId, context, callFn })
 *     └─ callFn({ model, prompt }) → createAiProviderClient(model 字段).generateJson(prompt)
 *
 * jobId 必须是真实 AnalysisJob id（analysis_phase_logs.jobId 外键）。
 * 身份解析是管线 Pass0，运行于分析任务内，jobId 由调用方传入。
 */
import { aiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import { createAiProviderClient } from "@/server/providers/ai";
import { PipelineStage } from "@/types/pipeline";

export interface IdentityLlmCallInput {
  stage: PipelineStage;
  system: string;
  user: string;
  /** 必须为真实 AnalysisJob id（写 analysis_phase_logs）。 */
  jobId: string;
  bookId?: string | null;
  temperature?: number;
  maxOutputTokens?: number;
}

export interface IdentityLlmResult<TData> {
  data: TData;
  modelId: string;
  isFallback: boolean;
}

/**
 * 执行一次身份解析 LLM 调用（结构化 JSON 输出）。
 * @throws 非 JSON 输出或重试耗尽时抛错（由 AiCallExecutor 统一重试/fallback）。
 */
export async function callIdentityLlm<TData>(input: IdentityLlmCallInput): Promise<IdentityLlmResult<TData>> {
  const prompt = { system: input.system, user: input.user };

  const result = await aiCallExecutor.execute<TData>({
    stage: input.stage,
    prompt,
    jobId: input.jobId,
    context: { bookId: input.bookId ?? null, jobId: input.jobId },
    callFn: async ({ model, prompt: p }) => {
      const client = createAiProviderClient({
        provider: model.provider,
        protocol: model.protocol,
        apiKey: model.apiKey,
        baseUrl: model.baseUrl,
        modelName: model.modelName,
      });
      const gen = await client.generateJson(p, {
        temperature: input.temperature,
        maxOutputTokens: input.maxOutputTokens,
      });
      let data: TData;
      try {
        data = JSON.parse(gen.content) as TData;
      } catch {
        throw new Error(`identity LLM 输出非 JSON: ${gen.content.slice(0, 200)}`);
      }
      return { data, usage: gen.usage };
    },
  });

  return { data: result.data, modelId: result.modelId, isFallback: result.isFallback };
}
