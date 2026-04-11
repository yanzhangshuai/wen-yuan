/**
 * =============================================================================
 * 文件定位：`src/server/lib/knowledge-job-store.ts`
 * -----------------------------------------------------------------------------
 * 知识库模型生成任务的进程内短暂存储。
 *
 * 设计说明：
 * - 使用 Node.js 进程全局 Map 存储任务状态，适用于单容器部署场景。
 * - 任务结果在 15 分钟后自动清理，防止内存泄露。
 * - 不依赖外部缓存（Redis / DB），保持零额外基础设施依赖。
 * =============================================================================
 */

const JOB_TTL_MS = 15 * 60 * 1000; // 15 分钟

export type KnowledgeJobStatus = "pending" | "running" | "done" | "error";

export interface KnowledgeJob<T = unknown> {
  id       : string;
  status   : KnowledgeJobStatus;
  /** 当前阶段描述，毫秒精度供前端展示进度信息。 */
  step     : string;
  result?  : T;
  error?   : string;
  createdAt: number;
  updatedAt: number;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const store = new Map<string, KnowledgeJob<any>>();

function cleanup(): void {
  const now = Date.now();
  for (const [id, job] of store.entries()) {
    if (now - job.updatedAt > JOB_TTL_MS) {
      store.delete(id);
    }
  }
}

export function createJob<T>(id: string): KnowledgeJob<T> {
  cleanup();
  const job: KnowledgeJob<T> = {
    id,
    status   : "pending",
    step     : "任务已排队，等待执行…",
    createdAt: Date.now(),
    updatedAt: Date.now()
  };
  store.set(id, job);
  return job;
}

export function updateJob<T>(
  id: string,
  patch: Partial<Pick<KnowledgeJob<T>, "status" | "step" | "result" | "error">>
): void {
  const job = store.get(id) as KnowledgeJob<T> | undefined;
  if (!job) return;
  Object.assign(job, patch, { updatedAt: Date.now() });
}

export function getJob<T>(id: string): KnowledgeJob<T> | undefined {
  return store.get(id) as KnowledgeJob<T> | undefined;
}
