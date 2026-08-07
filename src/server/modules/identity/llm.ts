/**
 * identity 模块 LLM 调用封装。
 *
 * 正确调用链：
 *   aiCallExecutor.execute({ stage, prompt, jobId, callFn })
 *     └─ callFn({ model, prompt }) → createAiProviderClient(model 字段).generateJson(prompt)
 *
 * jobId 必须是真实 AnalysisJob id（analysis_phase_logs.jobId 外键）。
 * 身份解析是管线 Pass0，运行于分析任务内，jobId 由调用方传入。
 */
import { aiCallExecutor } from "@/server/modules/analysis/services/AiCallExecutor";
import { callJsonLlm } from "@/server/providers/ai/callJsonLlm";

export interface IdentityLlmCallInput {
  /** 阶段标识：写入 analysis_phase_logs.stage（如 "ROSTER_DISCOVERY"、"TITLE_RESOLUTION"）。 */
  stage           : string;
  system          : string;
  user            : string;
  /** 必须为真实 AnalysisJob id（写 analysis_phase_logs）。 */
  jobId           : string;
  /** 可选：跨模型复核时显式指定模型 id；缺省 = 系统默认模型。 */
  modelId?        : string;
  temperature?    : number;
  maxOutputTokens?: number;
}

export interface IdentityLlmResult<TData> {
  data: TData;
}

/**
 * 执行一次身份解析 LLM 调用（结构化 JSON 输出）。
 * @throws 非 JSON 输出或重试耗尽时抛错（由 AiCallExecutor 统一重试）。
 */
export async function callIdentityLlm<TData>(input: IdentityLlmCallInput): Promise<IdentityLlmResult<TData>> {
  const prompt = { system: input.system, user: input.user };

  const result = await aiCallExecutor.execute<TData>({
    stage  : input.stage,
    prompt,
    jobId  : input.jobId,
    modelId: input.modelId,
    callFn : async ({ model, prompt: p }) => callJsonLlm<TData>(model, p, {
      temperature    : input.temperature,
      maxOutputTokens: input.maxOutputTokens,
      label          : "identity"
    })
  });

  return { data: result.data };
}
