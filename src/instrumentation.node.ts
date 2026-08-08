/**
 * =============================================================================
 * 文件定位：`src/instrumentation.ts`（Next.js 服务端启动钩子）
 * -----------------------------------------------------------------------------
 * Next.js 在 Node 服务启动时调用 `register()` 一次（`next dev` / `next start` 均执行）。
 * 用途：启动"分析任务 drain"后台循环，作为分析路由 fire-and-forget 的兜底，
 * 保证 QUEUED 任务即使请求生命周期中断也能被捞起执行。
 *
 * 背景：`POST /api/books/:id/analyze` 采用 `void runAnalysisJobById()` 后台执行，
 * 在部分环境（如 next dev 请求作用域）下该 promise 可能在 claim 落库前被终止，
 * 导致任务永久 QUEUED、进度面板停在"等待任务启动"。这里用独立于请求作用域的
 * 常驻循环定时捞取 QUEUED 任务，与路由触发互斥（claim 为原子 updateMany）。
 *
 * 边界：
 * - 仅在 Node 运行时 + 非构建阶段启动，避免 edge 运行时与构建期误启循环；
 * - 单本书场景下按 FIFO 顺序逐个执行，不并发；
 * - RUNNING 悬挂任务的自动恢复不在本循环职责内（无心跳，误判风险高）。
 * =============================================================================
 */
import { AnalysisJobStatus } from "@/generated/prisma/enums";

/** drain 轮询间隔：与前端进度面板轮询（3s）同频，保证任务尽快被捞起。 */
export const DRAIN_INTERVAL_MS = 3000;

/**
 * 功能：捞起最早的 QUEUED 分析任务并执行（单个任务；claim 失败自动跳过）。
 * 输入：无。
 * 输出：Promise<void>。
 * 异常：任务执行失败由 `runAnalysisJobById` 内部落终态；此处仅记录日志不中断循环。
 * 副作用：执行一个分析任务（整条管线写入）。
 */
export async function drainQueuedAnalysisJobs(): Promise<void> {
  const { prisma } = await import("@/server/db/prisma");
  const job = await prisma.analysisJob.findFirst({
    where  : { status: AnalysisJobStatus.QUEUED },
    orderBy: { createdAt: "asc" },
    select : { id: true }
  });
  if (!job) {
    return;
  }

  const { runAnalysisJobById } = await import("@/server/modules/analysis/jobs/runAnalysisJob");
  await runAnalysisJobById(job.id);
}

/**
 * 功能：启动 drain 常驻循环（每 3 秒捞一个 QUEUED 任务）。
 * 输入：无。
 * 输出：void。
 * 异常：单次执行失败仅记录日志，循环继续。
 * 副作用：注册 setInterval 定时器（unref，不阻止进程退出）。
 */
function startDrainLoop(): void {
  setInterval(() => {
    void drainQueuedAnalysisJobs().catch((error: unknown) => {
      console.error(
        "[analysis.drain] loop.failed",
        error instanceof Error ? error.message : String(error)
      );
    });
  }, DRAIN_INTERVAL_MS).unref();
}

/**
 * Next.js 服务启动钩子。
 * 仅当运行在 Node 运行时且非构建阶段时启动 drain 循环。
 */
export function register(): void {
  if (process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }
  if (process.env.NEXT_PHASE === "phase-production-build") {
    return;
  }
  startDrainLoop();
}
