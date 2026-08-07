/**
 * 文件定位（后端 AI 流水线共享类型层）：
 * - 该文件定义 AI 调用输入输出与 usage 统计的纯类型。
 *
 * 业务职责：
 * - 统一 AI 调用参数与 usage 统计结构，保证多模型 Provider 行为可比较。
 */

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
