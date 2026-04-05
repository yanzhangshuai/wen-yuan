/**
 * ============================================================================
 * 文件定位：`src/lib/services/model-strategy.ts`
 * ----------------------------------------------------------------------------
 * 这是“管理端模型策略”相关的前端服务层（Client-side Service）。
 *
 * 在 Next.js 项目中的角色：
 * - 非 `page.tsx` / `route.ts`，不直接参与路由约定；
 * - 属于前端数据访问层，通常被 Client Component 调用；
 * - 通过 `clientFetch` 统一调用后端 API，减少组件内部的网络与错误处理样板代码。
 *
 * 业务职责：
 * - 读取/保存“全局模型策略（GLOBAL）”；
 * - 读取/保存“书籍模型策略（BOOK）”；
 * - 查询分析任务的模型调用成本汇总（便于运营评估成本与效果）。
 *
 * 渲染与运行环境说明：
 * - 该文件可被客户端组件导入，实际 HTTP 请求从浏览器发起；
 * - 因为请求携带登录态，且管理台数据要求实时性，默认使用 `cache: "no-store"`。
 *
 * 维护注意：
 * - `PipelineStage` 与后端策略 DTO 强绑定，新增/修改阶段时需要前后端同步；
 * - 这些函数返回的是“解包后的 data”，不是原始 API 壳结构。
 * ============================================================================
 */
import { clientFetch } from "@/lib/client-api";
import type { PipelineStage } from "@/types/pipeline";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

export interface StageModelConfigInput {
  /**
   * 模型唯一标识（来自模型配置中心）。
   * 业务含义：指定该阶段优先使用哪个模型。
   */
  modelId         : string;
  /**
   * 采样温度。
   * 可选的原因：不同阶段对温度要求不同，未传时由后端继承默认策略。
   */
  temperature?    : number;
  /**
   * 单次最大输出 token。
   * 可选：允许按阶段控制成本；不传则由后端默认值兜底。
   */
  maxOutputTokens?: number;
  /** nucleus sampling 参数。 */
  topP?           : number;
  /**
   * 是否启用“深度思考”模式。
   * 业务语义：某些高复杂阶段可开启以提高质量，但可能增加耗时和成本。
   */
  enableThinking? : boolean;
  /**
   * 推理强度档位。
   * 仅在支持该能力的模型上生效，值域由业务约定限定为 low/medium/high。
   */
  reasoningEffort?: "low" | "medium" | "high";
  /**
   * 失败重试次数。
   * 可选：用于在稳定性与时延之间做业务权衡。
   */
  maxRetries?     : number;
  /**
   * 重试基础退避毫秒数。
   * 与 `maxRetries` 联动，影响失败恢复速度与上游限流压力。
   */
  retryBaseMs?    : number;
}

/**
 * 模型策略输入结构：
 * - key：流水线阶段（`PipelineStage`）；
 * - value：该阶段的模型配置。
 *
 * 使用 `Partial` 的业务原因：
 * - 并非所有阶段都需要显式覆盖；
 * - 未配置的阶段应回退到“书籍策略/全局策略/系统默认”。
 */
export type ModelStrategyInput = Partial<Record<PipelineStage, StageModelConfigInput>>;

interface ModelStrategyRecord {
  /** 策略记录主键。 */
  id       : string;
  /** 策略作用域：GLOBAL=全局，BOOK=书籍，JOB=任务临时策略。 */
  scope    : "GLOBAL" | "BOOK" | "JOB";
  /** 关联书籍 ID，仅 BOOK 作用域有值。 */
  bookId   : string | null;
  /** 关联任务 ID，仅 JOB 作用域有值。 */
  jobId    : string | null;
  /** 阶段策略配置主体。 */
  stages   : ModelStrategyInput;
  /** 创建时间（ISO 字符串）。 */
  createdAt: string;
  /** 更新时间（ISO 字符串）。 */
  updatedAt: string;
}

export interface JobCostSummaryModelItem {
  /** 模型 ID。历史数据兼容场景下可能为空。 */
  modelId         : string | null;
  /** 展示用模型名称。 */
  modelName       : string;
  /** 是否属于 fallback 调用（主模型失败后的降级调用）。 */
  isFallback      : boolean;
  /** 调用次数。 */
  calls           : number;
  /** 输入 token 总量。 */
  promptTokens    : number;
  /** 输出 token 总量。 */
  completionTokens: number;
}

export interface JobCostSummaryStageItem {
  /** 阶段标识（例如实体抽取、关系推断等）。 */
  stage           : string;
  /** 该阶段总调用次数。 */
  calls           : number;
  /** 该阶段输入 token 总量。 */
  promptTokens    : number;
  /** 该阶段输出 token 总量。 */
  completionTokens: number;
  /** 平均耗时（毫秒）。 */
  avgDurationMs   : number;
  /** 阶段内按模型聚合的成本明细。 */
  models          : JobCostSummaryModelItem[];
}

export interface JobCostSummary {
  /** 分析任务 ID。 */
  jobId                : string;
  /** 任务全链路输入 token 总量。 */
  totalPromptTokens    : number;
  /** 任务全链路输出 token 总量。 */
  totalCompletionTokens: number;
  /** 任务全链路耗时（毫秒）。 */
  totalDurationMs      : number;
  /** 任务总调用次数。 */
  totalCalls           : number;
  /** 失败调用次数。 */
  failedCalls          : number;
  /** fallback 调用次数。 */
  fallbackCalls        : number;
  /** 按阶段聚合的成本明细。 */
  byStage              : JobCostSummaryStageItem[];
}

/* ------------------------------------------------
   Helpers
   ------------------------------------------------ */

function unwrapStrategy(record: ModelStrategyRecord | null): ModelStrategyInput | null {
  // 设计目的：
  // 路由层返回的是完整策略记录（含 id/scope/时间戳），
  // 而页面编辑器通常只关心 stages，因此在服务层完成“视图模型解包”。
  return record?.stages ?? null;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取全局模型策略（GLOBAL）。
 *
 * 请求时机：
 * - 常见于管理台“模型策略配置页”初始化阶段。
 *
 * 为什么使用 `no-store`：
 * - 该配置可能被多管理员同时修改，使用缓存可能导致页面展示旧值。
 *
 * @returns
 * - `ModelStrategyInput`：存在配置时返回阶段映射；
 * - `null`：尚未配置全局策略时返回空。
 */
export async function fetchGlobalStrategy(): Promise<ModelStrategyInput | null> {
  const data = await clientFetch<ModelStrategyRecord | null>("/api/admin/model-strategy/global", {
    cache: "no-store"
  });
  return unwrapStrategy(data);
}

/**
 * 保存全局模型策略（GLOBAL）。
 *
 * @param strategy 前端策略编辑器产出的阶段配置映射。
 * @returns `Promise<void>`，调用方通常只关心成功/失败，不依赖返回体内容。
 */
export async function saveGlobalStrategy(strategy: ModelStrategyInput): Promise<void> {
  await clientFetch<ModelStrategyRecord>("/api/admin/model-strategy/global", {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ stages: strategy })
  });
}

/**
 * 获取书籍模型策略（BOOK）。
 *
 * @param bookId 书籍 ID（来自路由参数或当前选中书籍）。
 * @returns
 * - 有配置：返回该书覆盖策略；
 * - 无配置：返回 `null`，调用方应回退展示全局策略或默认值。
 */
export async function fetchBookStrategy(bookId: string): Promise<ModelStrategyInput | null> {
  const data = await clientFetch<ModelStrategyRecord | null>(
    `/api/admin/books/${encodeURIComponent(bookId)}/model-strategy`,
    { cache: "no-store" }
  );
  return unwrapStrategy(data);
}

/**
 * 保存书籍模型策略（BOOK）。
 *
 * 业务影响：
 * - 保存后，该书后续发起的分析任务会优先应用书籍级策略。
 *
 * @param bookId 书籍 ID。
 * @param strategy 当前编辑后的阶段策略映射。
 */
export async function saveBookStrategy(bookId: string, strategy: ModelStrategyInput): Promise<void> {
  await clientFetch<ModelStrategyRecord>(`/api/admin/books/${encodeURIComponent(bookId)}/model-strategy`, {
    method : "PUT",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ stages: strategy })
  });
}

/**
 * 获取任务成本概览（按阶段 + 模型聚合，含 fallback 标记）。
 *
 * @param jobId 任务 ID。
 * @returns `JobCostSummary`，用于成本可视化面板展示。
 */
export async function fetchJobCostSummary(jobId: string): Promise<JobCostSummary> {
  return clientFetch<JobCostSummary>(
    `/api/admin/analysis-jobs/${encodeURIComponent(jobId)}/cost-summary`,
    { cache: "no-store" }
  );
}
