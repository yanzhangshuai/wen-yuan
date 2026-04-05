/**
 * 文件定位（后端 AI 流水线共享类型层）：
 * - 该文件定义“分析流水线阶段枚举 + 阶段参数默认值 + AI 调用输入输出类型”。
 * - 会被服务端分析模块、模型策略模块、管理后台配置接口共同消费。
 *
 * 业务职责：
 * - 统一阶段命名，确保任务编排、日志、配置读写都使用同一套标识；
 * - 统一 AI 调用参数与 usage 统计结构，保证多模型 Provider 行为可比较。
 */
export enum PipelineStage {
  /** 角色发现阶段：从文本中识别人物候选。 */
  ROSTER_DISCOVERY = "ROSTER_DISCOVERY",
  /** 分块抽取阶段：按章节/片段抽取结构化线索。 */
  CHUNK_EXTRACTION = "CHUNK_EXTRACTION",
  /** 章节级校验阶段：对抽取结果执行一致性检查。 */
  CHAPTER_VALIDATION = "CHAPTER_VALIDATION",
  /** 标题/称谓消歧阶段：统一同名异称。 */
  TITLE_RESOLUTION = "TITLE_RESOLUTION",
  /** 灰区仲裁阶段：处理规则无法直接判定的冲突。 */
  GRAY_ZONE_ARBITRATION = "GRAY_ZONE_ARBITRATION",
  /** 全书终检阶段：产出最终可入库结论。 */
  BOOK_VALIDATION = "BOOK_VALIDATION",
  /** 兜底阶段：当策略缺失时用于容错映射。 */
  FALLBACK = "FALLBACK"
}

/**
 * 仅用于业务遍历/统计/展示的阶段集合。
 * 注意：FALLBACK 不在业务阶段中，仅作为配置槽位使用。
 */
export const BUSINESS_PIPELINE_STAGES: PipelineStage[] = [
  PipelineStage.ROSTER_DISCOVERY,
  PipelineStage.CHUNK_EXTRACTION,
  PipelineStage.CHAPTER_VALIDATION,
  PipelineStage.TITLE_RESOLUTION,
  PipelineStage.GRAY_ZONE_ARBITRATION,
  PipelineStage.BOOK_VALIDATION
];

export interface StageParams {
  /** 采样温度：越低越稳定，越高越发散。 */
  temperature     : number;
  /** 输出 token 上限：防止响应过长导致截断。 */
  maxOutputTokens : number;
  /** nucleus sampling 参数：控制候选词概率截断范围。 */
  topP            : number;
  /** 单阶段最大重试次数：控制成本与稳定性的平衡。 */
  maxRetries      : number;
  /** 重试基准退避时间（毫秒）。 */
  retryBaseMs     : number;
  /** 是否启用“深度思考”模式（依赖具体模型能力）。 */
  enableThinking? : boolean;
  /** 推理强度档位：仅部分模型支持。 */
  reasoningEffort?: "low" | "medium" | "high";
}

/**
 * 各阶段默认参数。
 * 设计原因：
 * - 通过 `Record<PipelineStage, StageParams>` 强制每个阶段都有默认配置；
 * - 这组值是“业务默认策略”，并非模型 SDK 的硬限制。
 */
export const DEFAULT_STAGE_PARAMS: Record<PipelineStage, StageParams> = {
  [PipelineStage.ROSTER_DISCOVERY]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 2,
    retryBaseMs    : 600,
    enableThinking : false
  },
  [PipelineStage.CHUNK_EXTRACTION]: {
    temperature    : 0.15,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 2,
    retryBaseMs    : 600,
    enableThinking : false
  },
  [PipelineStage.CHAPTER_VALIDATION]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 600,
    enableThinking : false
  },
  [PipelineStage.TITLE_RESOLUTION]: {
    temperature    : 0.4,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 2,
    retryBaseMs    : 1000,
    enableThinking : true
  },
  [PipelineStage.GRAY_ZONE_ARBITRATION]: {
    temperature    : 0.3,
    maxOutputTokens: 4096,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 600,
    enableThinking : true
  },
  [PipelineStage.BOOK_VALIDATION]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 1000,
    enableThinking : true
  },
  [PipelineStage.FALLBACK]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 600,
    enableThinking : false
  }
};

/**
 * 阶段模型来源。
 * 语义：
 * - `JOB`：任务级配置；
 * - `BOOK`：书籍级配置；
 * - `GLOBAL`：全局配置；
 * - `SYSTEM_DEFAULT`：系统内建默认；
 * - `FALLBACK`：异常情况下的最后兜底。
 */
export type StageModelSource = "JOB" | "BOOK" | "GLOBAL" | "SYSTEM_DEFAULT" | "FALLBACK";

export interface PromptMessageInput {
  /** 系统指令：约束模型角色、输出格式与规则。 */
  system: string;
  /** 用户指令：本次阶段的具体任务内容。 */
  user  : string;
}

export interface AiUsage {
  /** 输入 token 数；模型不返回时为 null。 */
  promptTokens    : number | null;
  /** 输出 token 数；模型不返回时为 null。 */
  completionTokens: number | null;
  /** 总 token 数；模型不返回时为 null。 */
  totalTokens     : number | null;
}

export interface AiCallFnResult<TData> {
  /** 结构化解析后的业务数据。 */
  data : TData;
  /** 调用用量统计；不可用时为 null。 */
  usage: AiUsage | null;
}
