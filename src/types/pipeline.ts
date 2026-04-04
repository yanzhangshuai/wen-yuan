export enum PipelineStage {
  ROSTER_DISCOVERY = "ROSTER_DISCOVERY",
  CHUNK_EXTRACTION = "CHUNK_EXTRACTION",
  CHAPTER_VALIDATION = "CHAPTER_VALIDATION",
  TITLE_RESOLUTION = "TITLE_RESOLUTION",
  GRAY_ZONE_ARBITRATION = "GRAY_ZONE_ARBITRATION",
  BOOK_VALIDATION = "BOOK_VALIDATION",
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
  temperature     : number;
  maxOutputTokens : number;
  topP            : number;
  maxRetries      : number;
  retryBaseMs     : number;
  enableThinking? : boolean;
  reasoningEffort?: "low" | "medium" | "high";
}

export const DEFAULT_STAGE_PARAMS: Record<PipelineStage, StageParams> = {
  [PipelineStage.ROSTER_DISCOVERY]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 2,
    retryBaseMs    : 600
  },
  [PipelineStage.CHUNK_EXTRACTION]: {
    temperature    : 0.15,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 2,
    retryBaseMs    : 600
  },
  [PipelineStage.CHAPTER_VALIDATION]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 600
  },
  [PipelineStage.TITLE_RESOLUTION]: {
    temperature    : 0.4,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 2,
    retryBaseMs    : 1000
  },
  [PipelineStage.GRAY_ZONE_ARBITRATION]: {
    temperature    : 0.3,
    maxOutputTokens: 4096,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 600
  },
  [PipelineStage.BOOK_VALIDATION]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 1000
  },
  [PipelineStage.FALLBACK]: {
    temperature    : 0.2,
    maxOutputTokens: 8192,
    topP           : 1,
    maxRetries     : 1,
    retryBaseMs    : 600
  }
};

export type StageModelSource = "JOB" | "BOOK" | "GLOBAL" | "SYSTEM_DEFAULT" | "FALLBACK";

export interface PromptMessageInput {
  system: string;
  user  : string;
}

export interface AiUsage {
  promptTokens    : number | null;
  completionTokens: number | null;
  totalTokens     : number | null;
}

export interface AiCallFnResult<TData> {
  data : TData;
  usage: AiUsage | null;
}
