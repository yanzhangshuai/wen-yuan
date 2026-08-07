/**
 * 文件定位（后端 AI 流水线共享类型层）：
 * - 该文件定义“功能点模型映射键 + AI 调用输入输出类型”。
 * - v5 精简（阶段 4）：v4 的 9 阶段矩阵（PipelineStage / StageParams / 阶段模型策略）已被
 *   功能点模型 `feature_models` 取代，此处只保留 AI 调用相关的纯类型。
 *
 * 业务职责：
 * - 统一功能点命名，确保模型选择、日志、管理端配置使用同一套标识；
 * - 统一 AI 调用参数与 usage 统计结构，保证多模型 Provider 行为可比较。
 */

/**
 * 功能点模型键。
 * 模型按“功能点”指定（feature_models 表全局映射），选择权交给 AI，代码只留确定性骨架。
 * - `SKILL_SELECTOR`：动态 skill 选择（廉价模型，每次任务启动调用一次）；
 * - `PIPELINE_MAIN`：身份（Tier1/Tier2）+ 提取主流程（最强模型）；
 * - `REVIEW`：Pass4 例外审核（中档模型）。
 */
export enum FeatureKey {
  SKILL_SELECTOR = "SKILL_SELECTOR",
  PIPELINE_MAIN  = "PIPELINE_MAIN",
  REVIEW         = "REVIEW"
}

/** 全部功能点集合，供遍历/管理端展示使用。 */
export const FEATURE_KEYS: FeatureKey[] = [
  FeatureKey.SKILL_SELECTOR,
  FeatureKey.PIPELINE_MAIN,
  FeatureKey.REVIEW
];

export interface PromptMessageInput {
  /** 系统指令：约束模型角色、输出格式与规则。 */
  system: string;
  /** 用户指令：本次调用的具体任务内容。 */
  user  : string;
}

export interface AiUsage {
  /** 输入 token 数；模型不返回时为 null。 */
  promptTokens    : number | null;
  /** 输出 token 数；模型不返回时为 null。 */
  completionTokens: number | null;
  /** 总 token 数；模型不返回时为 null。 */
  totalTokens     : number | null;
  /** 缓存命中 token 数（DeepSeek 自动前缀缓存）；不支持时为 null。 */
  cacheHitTokens? : number | null;
  /** 缓存未命中 token 数；不支持时为 null。 */
  cacheMissTokens?: number | null;
}

export interface AiCallFnResult<TData> {
  /** 结构化解析后的业务数据。 */
  data : TData;
  /** 调用用量统计；不可用时为 null。 */
  usage: AiUsage | null;
}
