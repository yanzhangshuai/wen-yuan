/**
 * 跨模型复核接口（Pass4 例外审核流）。
 *
 * 依据架构 doc §7.2/7.4：定向风险集中类（同名/近名簇、多候选 TITLE_ONLY、
 * 跨卷边界、关系级幻觉样本）复用身份判定原语，**显式换模型跑原语**。
 *
 * 换模型机制：feature_models 已删（v5-simplify），跨模型复核由调用方
 * 显式传 modelId（AiCallExecutor.execute 的 modelId 覆盖，见阶段 1）。
 */
import {
  runPrimitive,
  type MentionWindow,
  type PrimitiveVerdict
} from "@/server/modules/identity/primitive";
import type { BookRegistry } from "@/server/modules/identity/registry";

export interface CrossModelReviewInput {
  surfaceForm: string;
  windows    : MentionWindow[];
  registry   : BookRegistry;
  bookSummary: string;
  skills     : string[];
  jobId      : string;
  /** 复核模型 id（区别于主流程默认模型的第二个模型）。 */
  modelId    : string;
}

export interface CrossModelReviewResult {
  verdict         : PrimitiveVerdict;
  highConfidence  : boolean;
  resolvedEntityId: string | null;
  /** 复核使用的模型 id。 */
  modelId         : string;
}

/**
 * 功能：对定向风险候选执行跨模型复核（复用身份判定原语 + 显式 modelId 换模型）。
 * 输入：表面形式、出现窗口、登记表、摘要、skill、jobId、复核模型 id。
 * 输出：复核 verdict + 高置信标记 + 使用模型 id。
 * 异常：模型不存在/停用或 LLM 失败时抛错。
 * 副作用：一次跨模型 LLM 调用（写 analysis_phase_logs，modelSource=CROSS_MODEL）。
 */
export async function crossModelReview(
  input: CrossModelReviewInput
): Promise<CrossModelReviewResult> {
  const { output, highConfidence } = await runPrimitive({
    surfaceForm: input.surfaceForm,
    windows    : input.windows,
    registry   : input.registry,
    bookSummary: input.bookSummary,
    skills     : input.skills,
    jobId      : input.jobId,
    modelId    : input.modelId
  });

  return {
    verdict         : output.verdict,
    highConfidence,
    resolvedEntityId: output.resolvedEntityId,
    modelId         : input.modelId
  };
}
