import { beforeEach, describe, expect, it, vi } from "vitest";

import { drainQueuedAnalysisJobs } from "@/instrumentation.node";

const prismaFindFirstMock = vi.hoisted(() => vi.fn());
const runAnalysisJobByIdMock = vi.hoisted(() => vi.fn());

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    analysisJob: { findFirst: prismaFindFirstMock }
  }
}));
vi.mock("@/server/modules/analysis/jobs/runAnalysisJob", () => ({
  runAnalysisJobById: runAnalysisJobByIdMock
}));

/**
 * 文件定位（后台 drain 循环单测）：
 * - 覆盖 `instrumentation.ts` 中"捞起 QUEUED 任务并执行"的核心逻辑。
 * - 该循环是分析路由 fire-and-forget 的兜底，保障任务不被请求生命周期杀死。
 */
describe("drainQueuedAnalysisJobs", () => {
  beforeEach(() => {
    prismaFindFirstMock.mockReset();
    runAnalysisJobByIdMock.mockReset();
  });

  it("无 QUEUED 任务时不触发执行", async () => {
    prismaFindFirstMock.mockResolvedValue(null);

    await drainQueuedAnalysisJobs();

    expect(runAnalysisJobByIdMock).not.toHaveBeenCalled();
  });

  it("存在 QUEUED 任务时按 id 执行", async () => {
    prismaFindFirstMock.mockResolvedValue({ id: "job-queued" });
    runAnalysisJobByIdMock.mockResolvedValue(undefined);

    await drainQueuedAnalysisJobs();

    expect(prismaFindFirstMock).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: { createdAt: "asc" },
      select : { id: true }
    }));
    expect(runAnalysisJobByIdMock).toHaveBeenCalledWith("job-queued");
  });
});
