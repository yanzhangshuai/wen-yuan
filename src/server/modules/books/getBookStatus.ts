import { AnalysisJobStatus } from "@/generated/prisma/enums";
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 文件定位（服务端书籍模块 / 状态查询）：
 * - 提供“书籍解析实时状态快照”查询能力。
 * - 被轮询接口、管理后台进度展示等下游消费，属于只读服务层。
 */

/**
 * 统一的查询字段选择器。
 * 目的：让 Prisma 返回类型稳定可推断，避免编辑器/ESLint 在不同版本下出现 unsafe assignment 误报。
 * 额外收益：字段白名单集中维护，可防止无意扩展查询导致性能抖动。
 */
const BOOK_STATUS_SELECT = {
  status      : true,
  errorLog    : true,
  analysisJobs: {
    take   : 1,
    orderBy: { updatedAt: "desc" as const },
    select : {
      id          : true,
      status      : true,
      currentStage: true,
      errorLog    : true
    }
  },
  chapters: {
    orderBy: { no: "asc" as const },
    select : {
      no         : true,
      type       : true,
      title      : true,
      parseStatus: true
    }
  }
} satisfies Prisma.BookSelect;

const SUCCEEDED_JOB_SCOPE_SELECT = {
  scope         : true,
  chapterStart  : true,
  chapterEnd    : true,
  chapterIndices: true
} satisfies Prisma.AnalysisJobSelect;

type SucceededJobScope = Prisma.AnalysisJobGetPayload<{ select: typeof SUCCEEDED_JOB_SCOPE_SELECT }>;
type BookChapterRow = Prisma.BookGetPayload<{ select: typeof BOOK_STATUS_SELECT }>["chapters"][number];

/**
 * 管线阶段 → 进度映射（RUNNING 时按当前阶段加权展示，替代固定的 50%）。
 * 权重参考各 Pass 的相对耗时：Pass1 分片提取最重，跨度最大。
 */
const STAGE_PROGRESS: Record<string, { progress: number; label: string }> = {
  identity        : { progress: 10,  label: "身份解析" },
  extraction      : { progress: 30,  label: "分片提取" },
  reconcile       : { progress: 65,  label: "登记补判" },
  aggregate       : { progress: 80,  label: "聚合建图" },
  auto_accept     : { progress: 90,  label: "自动接受" },
  skill_generation: { progress: 95,  label: "技能生成" }
};

/**
 * 由最新分析任务状态推导解析进度。
 * - QUEUED → 等待任务启动（0）；
 * - RUNNING → 按当前管线阶段加权（缺省取 5 = 准备中）；
 * - SUCCEEDED → 解析完成（100）；
 * - FAILED / CANCELED / 无任务 → 0。
 */
function deriveJobProgress(
  status: AnalysisJobStatus | null,
  currentStage: string | null
): { progress: number; stage: string | undefined } {
  switch (status) {
    case AnalysisJobStatus.RUNNING: {
      const stage = currentStage ? STAGE_PROGRESS[currentStage] : undefined;
      return stage
        ? { progress: stage.progress, stage: stage.label }
        : { progress: 5, stage: "准备中" };
    }
    case AnalysisJobStatus.SUCCEEDED:
      return { progress: 100, stage: "解析完成" };
    case AnalysisJobStatus.QUEUED:
      return { progress: 0, stage: "等待任务启动" };
    default:
      return { progress: 0, stage: undefined };
  }
}

/**
 * RUNNING 阶段内按已完成调用数推进进度，避免"身份解析 10%"长时间不动被误判卡死。
 * - identity（Pass0）：roster 逐次推进 10 → 45；
 * - extraction（Pass1）：分片逐片推进 45 → 75。
 * 其余阶段保持阶段基准值。
 */
async function advanceRunningProgress(
  prismaClient: PrismaClient,
  jobId: string | null,
  currentStage: string | null,
  baseProgress: number
): Promise<number> {
  if (!jobId) {
    return baseProgress;
  }

  if (currentStage === "identity") {
    const done = await prismaClient.analysisPhaseLog.count({
      where: { jobId, stage: "ROSTER_DISCOVERY", status: "SUCCESS" }
    });
    return Math.min(45, baseProgress + done * 0.7);
  }

  if (currentStage === "extraction") {
    const done = await prismaClient.analysisPhaseLog.count({
      where: { jobId, stage: "INDEPENDENT_EXTRACTION", status: "SUCCESS" }
    });
    return Math.min(75, baseProgress + done * 1.5);
  }

  return baseProgress;
}

function isChapterCoveredBySucceededJob(chapter: BookChapterRow, job: SucceededJobScope | null): boolean {
  if (!job || chapter.type !== "CHAPTER") {
    return false;
  }

  if (job.scope === "FULL_BOOK") {
    return true;
  }

  if (job.scope === "CHAPTER_RANGE") {
    if (job.chapterStart == null || job.chapterEnd == null) {
      return false;
    }
    return chapter.no >= job.chapterStart && chapter.no <= job.chapterEnd;
  }

  if (job.scope === "CHAPTER_LIST") {
    return job.chapterIndices.includes(chapter.no);
  }

  return false;
}

/**
 * 书籍解析状态快照。
 */
export interface BookStatusSnapshot {
  /** 当前状态字符串（如 PENDING/PROCESSING/COMPLETED/ERROR）。 */
  status  : string;
  /** 解析进度（0~100）。 */
  progress: number;
  /** 当前阶段文本；为空通常表示尚未开始或阶段未上报。 */
  stage   : string | undefined;
  /** 错误摘要（优先书级错误，其次回退到最新分析任务错误）。 */
  errorLog: string | undefined;
  /** 各章节解析状态列表（按章节号升序）。 */
  chapters: Array<{ no: number; title: string; parseStatus: string }>;
}

export function createGetBookStatusService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：查询单本书的实时解析状态。
   * 输入：`bookId`。
   * 输出：状态快照（状态/进度/阶段/错误摘要）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function getBookStatus(bookId: string): Promise<BookStatusSnapshot> {
    // 先查书籍并一次性拿到所需关联数据，避免多次 round-trip。
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: BOOK_STATUS_SELECT
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    // 仅取最新任务的错误日志作为书级 errorLog 的补充信息，防止 UI 空展示。
    const latestJob = book.analysisJobs[0];
    const latestJobErrorLog = latestJob?.errorLog ?? undefined;
    const latestSucceededJob = await prismaClient.analysisJob.findFirst({
      where: {
        bookId,
        status: AnalysisJobStatus.SUCCEEDED
      },
      orderBy: [
        { finishedAt: "desc" },
        { updatedAt: "desc" }
      ],
      select: SUCCEEDED_JOB_SCOPE_SELECT
    });

    // 兼容历史数据：旧版本将“需复核”写成 PENDING，这里按最近一次成功任务覆盖范围映射为 REVIEW_PENDING。
    const normalizedChapters = book.chapters.map(chapter => ({
      no         : chapter.no,
      title      : chapter.title,
      parseStatus: chapter.parseStatus === "PENDING" && isChapterCoveredBySucceededJob(chapter, latestSucceededJob)
        ? "REVIEW_PENDING"
        : chapter.parseStatus
    }));

    // 进度从最新任务状态 + 当前管线阶段推导（前端读字段名不变）。
    const derived = deriveJobProgress(
      latestJob?.status ?? null,
      latestJob?.currentStage ?? null
    );
    // RUNNING 阶段内按已完成调用数推进，避免长时间停在阶段基准值被误判卡死。
    const progress = derived.stage
      ? await advanceRunningProgress(prismaClient, latestJob?.id ?? null, latestJob?.currentStage ?? null, derived.progress)
      : derived.progress;

    return {
      status  : book.status,
      errorLog: book.errorLog ?? latestJobErrorLog,
      chapters: normalizedChapters,
      progress,
      stage   : derived.stage
    };
  }

  return { getBookStatus };
}

export const { getBookStatus } = createGetBookStatusService();
export { BookNotFoundError } from "@/server/modules/books/errors";
