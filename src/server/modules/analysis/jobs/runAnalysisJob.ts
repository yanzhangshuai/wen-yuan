/**
 * v7 分析管线编排器（runAnalysisJob）
 * =============================================================================
 * 文件定位：`src/server/modules/analysis/jobs/runAnalysisJob.ts`
 *
 * 职责：确定性编排 v7 管线（extract-then-resolve），串联已就绪的组件
 *   （extraction / identity / review / skills），不承载业务逻辑。
 *
 * 时序（arch doc 15-agent-architecture-v7.md §3，硬约束）：
 *   claim → 快照(selectSkillsForJob) → 装载(resolveSkillsForJob)
 *     → Pass1(逐章 extractSlice + 实体验收闸 + 落库，临时实体，无登记表，chapterNo=本章)
 *     → Pass1.5 身份 Pass(紧凑名单全局规范化)
 *     → Pass1.75 确定性归并(临时实体→canonical) + dropped 清理
 *     → Pass3(refresh+Neo4j) → Pass4(自动接受)
 *     → Pass5(markOrphan+skillGenerator) → 终态
 *
 * 设计原则：
 * - 组件厚 + 管线薄：各 Pass 逻辑已在域模块实现，此处只编排；
 * - facts 唯一写入口：facts/mentions/aliases 由本管线落库；
 * - 提取先于身份：逐章局部提取（无全局登记表）+ 紧凑名单全局折叠，消除 v5 过度列举；
 * - 实体验收闸：实体从保留事实两端反推，0 提及垃圾源头被挡；
 * - 乐观并发 claim：updateMany QUEUED→RUNNING，抢到才执行；
 * - 取消贯穿：每 Pass 前查 CANCELED，抛出哨兵由外层跳过终态（不覆盖取消）。
 */
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { AnalysisJobStatus, AgentRunType, type EventCategory } from "@/generated/prisma/enums";
import { getNeo4jDriver } from "@/server/db/neo4j";
import { prisma } from "@/server/db/prisma";
import type { AnalysisScope } from "@/server/modules/books/startBookAnalysis";
import { refreshRelationshipsForBook } from "@/server/modules/extraction/aggregator";
import { mergeAliasGroups } from "@/server/modules/extraction/aliasResolver";
import type { ExtractSliceResult } from "@/server/modules/extraction/extractor";
import { relationshipCodesFromSnapshot } from "@/server/modules/extraction/schema";
import { buildSlices, type ChapterRef, type Slice } from "@/server/modules/extraction/slices";
import type { EntityTypeStr } from "@/server/modules/extraction/types";
import { scanMisattribution } from "@/server/modules/identity/conflictScan";
import { getRegistry, normalizeRegistryName } from "@/server/modules/identity/registry";
import { acceptFactsForJob } from "@/server/modules/review/autoAccept";
import type { SkillGenerationSignals } from "@/server/modules/skills/skillGenerator";

/** 管线运行的 job 上下文（各 Pass 共享）。 */
export interface JobRunContext {
  jobId : string;
  bookId: string;
  scope : AnalysisScope;
}

/** 提取并发上限（简单限流，无现成 util）。 */
const EXTRACTION_CONCURRENCY = 3;
/** 单片提取最大尝试次数（1 次初始 + 2 次重试）。 */
const MAX_SLICE_EXTRACTION_ATTEMPTS = 3;
/** 全书摘要长度上限（架构约定 1-2K）。 */
const BOOK_SUMMARY_MAX_CHARS = 2000;
/** 新创建实体 / 孤儿降级的默认置信度。 */
const ORPHAN_CONFIDENCE = 0.4;

/** 任务已取消哨兵：终态处理时据此跳过，避免覆盖 CANCELED 状态。 */
class JobCanceledError extends Error {
  constructor() {
    super("分析任务已取消");
    this.name = "JobCanceledError";
  }
}

/**
 * 功能：创建 v5 分析管线编排器。
 * 输入：prisma 客户端。
 * 输出：`runAnalysisJobById` / `runNextAnalysisJob`。
 * 异常：见各 Pass。
 * 副作用：读取/写入 analysis_jobs / facts / entities 等。
 */
export function createAnalysisJobRunner(prismaClient: PrismaClient = prisma) {
  /**
   * 功能：乐观抢占一个 QUEUED job（QUEUED→RUNNING）。
   * 输入：jobId。
   * 输出：是否抢到（true=本进程执行，false=已被其他 runner 处理）。
   * 副作用：更新 analysis_jobs 状态 + startedAt。
   */
  async function claimQueuedJob(jobId: string): Promise<boolean> {
    const result = await prismaClient.analysisJob.updateMany({
      where: { id: jobId, status: AnalysisJobStatus.QUEUED },
      data : {
        status      : AnalysisJobStatus.RUNNING,
        startedAt   : new Date(),
        finishedAt  : null,
        errorLog    : null,
        currentStage: null
      }
    });
    return result.count === 1;
  }

  /**
   * 功能：写入任务当前阶段标识（Pass 边界调用，驱动进度面板展示）。
   * 输入：jobId、阶段 key。
   * 副作用：更新 analysis_jobs.current_stage。
   */
  async function setStage(jobId: string, currentStage: string): Promise<void> {
    await prismaClient.analysisJob.update({
      where: { id: jobId },
      data : { currentStage }
    });
  }

  /**
   * 功能：检查任务是否被取消（status === CANCELED）。
   * 输入：jobId。
   * 输出：true=已取消。
   * 副作用：只读查询。
   */
  async function isJobCanceled(jobId: string): Promise<boolean> {
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: jobId },
      select: { status: true }
    });
    return job?.status === AnalysisJobStatus.CANCELED;
  }

  /**
   * 功能：按 job scope 选目标章节（no 过滤）。
   * 输入：jobId。
   * 输出：`{ jobId, bookId, scope, chapters }`（chapters 为按 no 排序的章节 ref）。
   * 异常：job 不存在时抛错。
   * 副作用：只读查询。
   */
  async function loadJobContext(jobId: string): Promise<{
    jobId   : string;
    bookId  : string;
    scope   : AnalysisScope;
    chapters: ChapterRef[];
  }> {
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: jobId },
      select: {
        id            : true,
        bookId        : true,
        scope         : true,
        chapterStart  : true,
        chapterEnd    : true,
        chapterIndices: true
      }
    });
    if (!job) {
      throw new Error(`分析任务不存在: ${jobId}`);
    }

    const scope = (job.scope ?? "FULL_BOOK") as AnalysisScope;
    const chapterWhere =
      scope === "CHAPTER_RANGE"
        ? { no: { gte: job.chapterStart ?? 1, lte: job.chapterEnd ?? Number.MAX_SAFE_INTEGER } }
        : scope === "CHAPTER_LIST"
          ? { no: { in: job.chapterIndices } }
          : {};

    const chapters = await prismaClient.chapter.findMany({
      where  : { bookId: job.bookId, ...chapterWhere },
      select : { id: true, no: true, title: true, content: true },
      orderBy: [{ no: "asc" }]
    });

    return { jobId: job.id, bookId: job.bookId, scope, chapters };
  }

  /**
   * 功能：写入终态（成功/失败 + 同步 book 状态）。
   * 输入：jobId、bookId、成功标志、错误信息（可选）。
   * 副作用：更新 analysis_jobs + books。
   */
  async function writeTerminalState(
    jobId: string,
    bookId: string,
    succeeded: boolean,
    errorMessage?: string
  ): Promise<void> {
    await prismaClient.$transaction([
      prismaClient.analysisJob.update({
        where: { id: jobId },
        data : {
          status    : succeeded ? AnalysisJobStatus.SUCCEEDED : AnalysisJobStatus.FAILED,
          finishedAt: new Date(),
          errorLog  : errorMessage ?? null
        }
      }),
      prismaClient.book.update({
        where: { id: bookId },
        data : {
          status  : succeeded ? "COMPLETED" : "ERROR",
          errorLog: succeeded ? null : (errorMessage ?? null)
        }
      })
    ]);
  }

  // ===========================================================================
  // 管线私有辅助（各 Pass 共享的数据准备 / 落库）
  // ===========================================================================

  /**
   * 功能：确保名字有实体（幂等）。先在查找表命中，再 DB 精确匹配，最后创建 + 本书档案。
   * 输入：名字、实体类型、bookId、查找表（新实体写入，供后续复用）。
   * 输出：entityId。
   * 副作用：可能创建 entity + entityProfile，更新查找表。
   */
  async function ensureEntityByName(
    name: string,
    type: EntityTypeStr,
    bookId: string,
    entityIdByName: Map<string, string>
  ): Promise<string> {
    const key = normalizeRegistryName(name);
    const existing = entityIdByName.get(key);
    if (existing) {
      return existing;
    }

    // DB 回退：name 精确命中全局实体（含本书档案）→ 复用，避免重复创建
    const dbEntity = await prismaClient.entity.findFirst({
      where : { name, deletedAt: null },
      select: { id: true, profiles: { where: { bookId, deletedAt: null }, take: 1 } }
    });
    if (dbEntity) {
      // 复用全局同名实体时必须为本书建档：登记表/身份 Pass 均按 entity_profiles 关联本书，
      // 缺档案的实体对本书不可见（重导入场景下会丢失复用实体）。
      if (dbEntity.profiles.length === 0) {
        await prismaClient.entityProfile.create({
          data: {
            entityId    : dbEntity.id,
            bookId,
            localName   : name,
            recordSource: "DRAFT_AI"
          }
        });
      }
      entityIdByName.set(key, dbEntity.id);
      return dbEntity.id;
    }

    // 创建新实体 + 本书档案（facts 唯一写入口，entity 侧由管线兜底创建）
    const created = await prismaClient.entity.create({
      data: {
        name,
        entityType  : type,
        nameType    : "NAMED",
        recordSource: "DRAFT_AI",
        confidence  : 0.7,
        aliases     : []
      },
      select: { id: true }
    });
    await prismaClient.entityProfile.create({
      data: {
        entityId    : created.id,
        bookId,
        localName   : name,
        recordSource: "DRAFT_AI"
      }
    });
    entityIdByName.set(key, created.id);
    return created.id;
  }

  /**
   * 功能：幂等注册别名记录（bookId+entityId+alias 已存在则跳过）。
   * 输入：bookId、entityId、别名。
   * 副作用：可能创建 alias（PENDING + DRAFT_AI）。
   */
  async function ensureAlias(bookId: string, entityId: string, alias: string): Promise<void> {
    const existing = await prismaClient.alias.findFirst({
      where: { bookId, entityId, alias, deletedAt: null }
    });
    if (existing) {
      return;
    }
    await prismaClient.alias.create({
      data: {
        bookId,
        entityId,
        alias,
        aliasType   : "NICKNAME",
        status      : "PENDING",
        recordSource: "DRAFT_AI",
        confidence  : 0.7
      }
    });
  }

  /**
   * 功能：写审计记录（agent_write_audits），返回下一个 stepIndex。
   * 输入：agentRunId、步序、动作、对象类型/ID、before/after JSON。
   * 副作用：创建 agent_write_audit 行。
   */
  async function writeAudit(
    agentRunId: string,
    stepIndex: number,
    action: string,
    objectType: string,
    objectId: string,
    before: unknown,
    after: unknown,
    reason?: string
  ): Promise<number> {
    await prismaClient.agentWriteAudit.create({
      data: {
        agentRunId,
        stepIndex,
        action,
        objectType,
        objectId,
        before : (before ?? null) as Prisma.InputJsonValue,
        after  : (after ?? null) as Prisma.InputJsonValue,
        allowed: true,
        reason : reason ?? "pipeline"
      }
    });
    return stepIndex + 1;
  }

  /**
   * 功能：agent_runs 留痕（全链路可追溯）。包裹一个管线阶段，成功/失败落状态。
   * 输入：bookId、jobId、runType、阶段函数（接收 agentRunId）。
   * 输出：无。
   * 异常：阶段函数异常时标记 FAILED 后原样上抛。
   * 副作用：创建/更新 agent_run 行。
   */
  async function traceAgentRun(
    bookId: string,
    jobId: string,
    runType: AgentRunType,
    fn: (agentRunId: string) => Promise<void>
  ): Promise<void> {
    const run = await prismaClient.agentRun.create({
      data  : { jobId, bookId, runType, status: "RUNNING", startedAt: new Date() },
      select: { id: true }
    });
    try {
      await fn(run.id);
      await prismaClient.agentRun.update({
        where: { id: run.id },
        data : { status: "SUCCEEDED", finishedAt: new Date() }
      });
    } catch (error) {
      await prismaClient.agentRun.update({
        where: { id: run.id },
        data : {
          status    : "FAILED",
          finishedAt: new Date(),
          errorLog  : error instanceof Error ? error.message : String(error)
        }
      });
      throw error;
    }
  }

  /**
   * 功能：全书摘要生成（确定性，零 LLM）：description + 章节首尾截取。
   * 输入：bookId。
   * 输出：1-2K 摘要文本。
   * 副作用：只读查询。
   */
  async function buildBookSummary(bookId: string): Promise<string> {
    const [book, chapters] = await Promise.all([
      prismaClient.book.findUnique({
        where : { id: bookId },
        select: { title: true, description: true }
      }),
      prismaClient.chapter.findMany({
        where  : { bookId },
        select : { no: true, content: true },
        orderBy: { no: "asc" }
      })
    ]);
    if (!book) {
      return "";
    }

    const parts: string[] = [];
    if (book.description?.trim()) {
      parts.push(`简介：${book.description.trim()}`);
    }
    if (chapters.length > 0) {
      const head = chapters.slice(0, 3).map((c) => c.content).join("").slice(0, 600);
      if (head) {
        parts.push(`开头：${head}`);
      }
      if (chapters.length > 3) {
        const tail = chapters.slice(-2).map((c) => c.content).join("").slice(-400);
        if (tail) {
          parts.push(`结尾：${tail}`);
        }
      }
    }
    const summary = parts.join("\n\n");
    return summary.length > BOOK_SUMMARY_MAX_CHARS ? summary.slice(0, BOOK_SUMMARY_MAX_CHARS) : summary;
  }

  /**
   * 功能：单片提取（含章节级重试 2 次，attempt 递增）。
   * 输入：片 + 上下文。
   * 输出：提取结果（facts/dropRecords）。
   * 异常：重试耗尽时标记失败章节并抛出最后一个错误。
   * 副作用：任务 attempt 递增；重试耗尽时目标章节 parseStatus=FAILED。
   */
  async function extractSliceWithRetry(input: {
    bookId               : string;
    jobId                : string;
    slice                : Slice;
    bookSummary          : string;
    skills               : string[];
    relationshipTypeCodes: string[];
    entityIdByName       : Map<string, string>;
  }): Promise<ExtractSliceResult> {
    const { extractSlice } = await import("@/server/modules/extraction/extractor");
    const sliceText = input.slice.chapters.map((c) => `${c.title}\n${c.content}`).join("\n\n");

    let lastError: unknown;
    for (let attempt = 0; attempt < MAX_SLICE_EXTRACTION_ATTEMPTS; attempt += 1) {
      try {
        return await extractSlice({
          bookId               : input.bookId,
          jobId                : input.jobId,
          sliceText,
          chapterNos           : input.slice.chapterNos,
          bookSummary          : input.bookSummary,
          skills               : input.skills,
          relationshipTypeCodes: input.relationshipTypeCodes,
          entityIdByName       : input.entityIdByName
        });
      } catch (error) {
        // 章节重试：任务 attempt 递增（初始 1，每次重试 +1）
        lastError = error;
        await prismaClient.analysisJob.update({
          where: { id: input.jobId },
          data : { attempt: { increment: 1 } }
        });
      }
    }

    // 仍失败：目标章节标记 FAILED，由调用方决定任务终态
    await prismaClient.chapter.updateMany({
      where: { id: { in: input.slice.chapters.map((c) => c.id) } },
      data : { parseStatus: "FAILED" }
    });
    throw lastError;
  }

  /**
   * 功能：一片提取结果落库（facts/mentions/aliases/agent_write_audits）。
   * 输入：提取结果 + 章节 ID 映射 + 名字查找表。
   * 副作用：创建 entity/profile/alias/fact/mention/审计行。
   */
  async function persistSliceFacts(input: {
    bookId        : string;
    jobId         : string;
    agentRunId    : string;
    sliceResult   : ExtractSliceResult;
    chapterIdByNo : Map<number, string>;
    entityIdByName: Map<string, string>;
  }): Promise<void> {
    const { slice, facts, dropRecords, entities } = input.sliceResult;
    let stepIndex = 0;

    // 1) 实体注册：只注册通过实体验收闸的实体（v7：实体从事实两端反推，
    //    不再独立遍历 slice.entities——0 提及垃圾实体在源头被挡）。
    //    事实参与者必在 entities 名单内（guardrails.acceptEntity 保证）。
    const typeByName = new Map<string, string>();
    for (const entity of entities) {
      typeByName.set(entity.name, entity.type);
      const entityId = await ensureEntityByName(entity.name, entity.type, input.bookId, input.entityIdByName);
      for (const alias of entity.aliases ?? []) {
        if (alias === entity.name) {
          continue;
        }
        await ensureAlias(input.bookId, entityId, alias);
        stepIndex = await writeAudit(
          input.agentRunId,
          stepIndex,
          "CREATE",
          "alias",
          `${entityId}:${alias}`,
          null,
          { entityId, alias },
          "extract"
        );
      }
    }

    // 2) 事实 + 提及落库（facts 唯一写入口）
    for (const fact of facts) {
      const chapterId = input.chapterIdByNo.get(fact.chapterNo);
      if (!chapterId) {
        continue; // 非目标章节锚点（护栏错位）跳过
      }

      const sourceEntityId = fact.sourceName
        ? await ensureEntityByName(fact.sourceName, typeByName.get(fact.sourceName) as EntityTypeStr ?? "PERSON", input.bookId, input.entityIdByName)
        : null;
      const targetEntityId = fact.targetName
        ? await ensureEntityByName(fact.targetName, typeByName.get(fact.targetName) as EntityTypeStr ?? "PERSON", input.bookId, input.entityIdByName)
        : null;

      const created = await prismaClient.fact.create({
        data: {
          bookId              : input.bookId,
          factType            : fact.factType,
          sourceEntityId,
          targetEntityId,
          relationshipTypeCode: fact.relationshipTypeCode ?? null,
          eventCategory       : (fact.eventCategory ?? null) as EventCategory | null,
          evidence            : fact.evidence,
          chapterId,
          chapterNo           : fact.chapterNo,
          payload             : fact.payload as unknown as Prisma.InputJsonValue,
          confidence          : fact.confidence,
          recordSource        : "DRAFT_AI",
          status              : "DRAFT",
          jobId               : input.jobId,
          agentRunId          : input.agentRunId
        }
      });
      stepIndex = await writeAudit(
        input.agentRunId,
        stepIndex,
        "CREATE",
        "fact",
        created.id,
        { source: fact.sourceName, target: fact.targetName },
        { chapterNo: fact.chapterNo, typeCode: fact.relationshipTypeCode },
        "extract"
      );

      // 提及（供 reconcile 扫漏网高频 / markOrphan 判孤儿）
      const mentionPairs: Array<[string | null, string | null]> = [
        [fact.sourceName, sourceEntityId],
        [fact.targetName, targetEntityId]
      ];
      for (const [name, entityId] of mentionPairs) {
        if (!name || !entityId) {
          continue;
        }
        const mention = await prismaClient.mention.create({
          data: { entityId, chapterId, rawText: name, recordSource: "DRAFT_AI", status: "DRAFT" }
        });
        stepIndex = await writeAudit(
          input.agentRunId,
          stepIndex,
          "CREATE",
          "mention",
          mention.id,
          null,
          { rawText: name },
          "extract"
        );
      }
    }

    // 3) 护栏丢弃记录留痕（审计可追溯）
    for (const drop of dropRecords) {
      stepIndex = await writeAudit(
        input.agentRunId,
        stepIndex,
        "REJECT",
        "fact",
        `${drop.kind}:${drop.reason}`,
        { detail: drop.detail },
        null,
        "guardrail"
      );
    }

    // 4) 单章落库成功 → 覆盖章节标记 SUCCEEDED（管线此前只复位 PENDING/标记 FAILED，
    //    成功章节永远停在「等待中」，UI 章节状态失真）。
    const chapterIds = slice.chapterNos
      .map((no) => input.chapterIdByNo.get(no))
      .filter((id): id is string => !!id);
    if (chapterIds.length > 0) {
      await prismaClient.chapter.updateMany({
        where: { id: { in: chapterIds } },
        data : { parseStatus: "SUCCEEDED" }
      });
    }
  }

  // ===========================================================================
  // Pass 步骤（私有函数，仅 runPipeline 编排调用）
  // ===========================================================================

  /**
   * 功能：身份 Pass（v7，替代 v5 的 Pass0 Tier1/Tier2）——
   *   提取产出去重表面形式 → 紧凑名单全局规范化 → 确定性归并 + dropped 清理。
   * 输入：bookId/jobId/agentRunId。
   * 副作用：写 canonical 实体、合并临时实体（facts/mentions 重指向）、别名注册、软删 dropped。
   */
  async function runIdentityAndProjection(input: {
    bookId    : string;
    jobId     : string;
    agentRunId: string;
  }): Promise<void> {
    const { runIdentityPass } = await import("@/server/modules/identity/identityPass");
    const { runProjection } = await import("@/server/modules/identity/projection");

    const { groups, dropped } = await runIdentityPass({
      bookId    : input.bookId,
      jobId     : input.jobId,
      agentRunId: input.agentRunId
    });
    await runProjection({
      bookId    : input.bookId,
      jobId     : input.jobId,
      agentRunId: input.agentRunId,
      groups,
      dropped
    });
  }

  /**
   * 功能：Pass1 逐章提取 + 落库（并发 ≤3，单章失败重试 2 次，顺序落库避免实体竞态）。
   * 输入：目标章节 + 上下文。
   * 异常：任一单片重试耗尽时上抛首个错误（任务走 FAILED）。
   * 副作用：写 facts/mentions/aliases/审计；任务 attempt 递增。
   */
  async function runPass1Slices(input: {
    bookId               : string;
    jobId                : string;
    agentRunId           : string;
    chapters             : ChapterRef[];
    bookSummary          : string;
    skills               : string[];
    relationshipTypeCodes: string[];
    entityIdByName       : Map<string, string>;
  }): Promise<void> {
    const slices = buildSlices(input.chapters, input.bookId);
    if (slices.length === 0) {
      return;
    }
    const chapterIdByNo = new Map(input.chapters.map((c) => [c.no, c.id]));

    // 阶段一：并发提取（每批 ≤3，单片失败重试 2 次）
    const extracted: ExtractSliceResult[] = [];
    const errors: unknown[] = [];

    for (let offset = 0; offset < slices.length; offset += EXTRACTION_CONCURRENCY) {
      const batch = slices.slice(offset, offset + EXTRACTION_CONCURRENCY);
      await Promise.all(batch.map(async (slice) => {
        try {
          const result = await extractSliceWithRetry({
            bookId               : input.bookId,
            jobId                : input.jobId,
            slice,
            bookSummary          : input.bookSummary,
            skills               : input.skills,
            relationshipTypeCodes: input.relationshipTypeCodes,
              entityIdByName       : input.entityIdByName
          });
          extracted.push(result);
        } catch (error) {
          errors.push(error);
        }
      }));
    }

    // 阶段二：顺序落库（entityId 解析 + 新实体创建串行，避免并发竞态）
    for (const result of extracted) {
      await persistSliceFacts({
        bookId        : input.bookId,
        jobId         : input.jobId,
        agentRunId    : input.agentRunId,
        sliceResult   : result,
        chapterIdByNo,
        entityIdByName: input.entityIdByName
      });
    }

    if (errors.length > 0) {
      throw errors[0];
    }
  }

  /**
   * 功能：Pass3 确定性聚合——别名合并 + 幂等重建 relationships + Neo4j 惰性同步。
   * 输入：bookId。
   * 副作用：写 alias 记录、重建 relationship 表、同步 Neo4j 图。
   */
  async function runPass3(bookId: string): Promise<void> {
    // 1) Union-Find 别名合并：单实体组幂等注册别名记录（多实体组属合并决策，交人审）
    const registry = await getRegistry(bookId, prismaClient);
    const groups = registry.entries.map((e) => ({
      entityId : e.entityId,
      canonical: e.canonical,
      aliases  : e.aliases
    }));
    const merged = mergeAliasGroups(groups);
    for (const group of merged) {
      if (group.entityIds.length !== 1) {
        continue;
      }
      for (const alias of group.aliases) {
        if (alias === group.canonical) {
          continue;
        }
        await ensureAlias(bookId, group.entityIds[0], alias);
      }
    }

    // 2) 幂等重建 relationships（RELATION 事实聚合，facts 为权威源）
    await refreshRelationshipsForBook(bookId, prismaClient);

    // 3) Neo4j 惰性全量重同步（未配置 Neo4j 时静默跳过，保 findPersonaPath 回退行为）
    await syncNeo4jBookGraph(bookId);
  }

  /**
   * 功能：Pass4 自动接受栈（五条件；全量分布式冲突扫描结果接入条件④）。
   * 输入：bookId/jobId。
   * 副作用：接受的事实 status=VERIFIED + recordSource=AUTO_VERIFIED。
   */
  async function runPass4(bookId: string, jobId: string): Promise<void> {
    const registry = await getRegistry(bookId, prismaClient);
    const aliasesMap = new Map<string, string>();
    for (const entry of registry.entries) {
      for (const alias of entry.aliases) {
        aliasesMap.set(alias, entry.entityId);
      }
    }
    // 全量分布式冲突扫描（Pass1 已写 mentions，此处信号有效）
    const conflictScan = await scanMisattribution(bookId, aliasesMap, registry.entries, prismaClient);
    await acceptFactsForJob(jobId, prismaClient, conflictScan);
  }

  /**
   * 功能：Pass5 信号采集——高频称谓 + 字典外关系码（SkillGenerator 候选输入）。
   * 输入：bookId/jobId。
   * 输出：SkillGenerationSignals（可为空信号集，调用方决定是否生成）。
   * 副作用：只读查询。
   */
  async function collectSkillSignals(bookId: string, jobId: string): Promise<SkillGenerationSignals> {
    const [registry, job, facts] = await Promise.all([
      getRegistry(bookId, prismaClient),
      prismaClient.analysisJob.findUnique({
        where : { id: jobId },
        select: { relationshipTypesSnapshot: true }
      }),
      prismaClient.fact.findMany({
        where : { bookId, factType: "RELATION", deletedAt: null },
        select: { relationshipTypeCode: true }
      })
    ]);

    // 高频 TITLE_ONLY 称谓（未建档但活跃）
    const frequentTitles = registry.entries
      .filter((e) => e.nameType === "TITLE_ONLY" && e.confidenceTier !== "LOW")
      .map((e) => e.canonical)
      .slice(0, 50);

    // 字典外关系码（facts 出现但不在任务快照契约内）
    const validCodes = new Set(
      relationshipCodesFromSnapshot(job?.relationshipTypesSnapshot).map((r) => r.code)
    );
    const unknownRelationshipCodes = Array.from(
      new Set(
        facts
          .map((f) => f.relationshipTypeCode)
          .filter((code): code is string => !!code && !validCodes.has(code))
      )
    ).slice(0, 30);

    const signals: SkillGenerationSignals = { bookId };
    if (frequentTitles.length > 0) {
      signals.frequentTitles = frequentTitles;
    }
    if (unknownRelationshipCodes.length > 0) {
      signals.unknownRelationshipCodes = unknownRelationshipCodes;
    }
    return signals;
  }

  /**
   * 功能：markOrphan——本书 mention 数 < 2 的实体置信度降级（0.4）。
   * 输入：bookId。
   * 输出：降级实体数。
   * 副作用：更新 entities.confidence。
   */
  async function markOrphan(bookId: string): Promise<number> {
    const [grouped, bookEntities] = await Promise.all([
      prismaClient.mention.groupBy({
        by    : ["entityId"],
        where : { chapter: { bookId }, deletedAt: null, status: { not: "REJECTED" } },
        _count: { _all: true }
      }),
      prismaClient.entity.findMany({
        where : { profiles: { some: { bookId, deletedAt: null } }, deletedAt: null },
        select: { id: true }
      })
    ]);

    const mentionCounts = new Map(grouped.map((g) => [g.entityId, g._count._all]));
    const orphanIds = bookEntities
      .filter((e) => (mentionCounts.get(e.id) ?? 0) < 2)
      .map((e) => e.id);
    if (orphanIds.length === 0) {
      return 0;
    }

    const result = await prismaClient.entity.updateMany({
      where: { id: { in: orphanIds }, profiles: { some: { bookId, deletedAt: null } } },
      data : { confidence: ORPHAN_CONFIDENCE }
    });
    return result.count;
  }

  /**
   * 功能：Neo4j 惰性全量重同步（节点 MERGE + 本书边全删重建）。
   * 数据来源：refreshRelationshipsForBook 后的 relationship 表 + entityProfiles。
   * 未配置 Neo4j 时静默跳过（保 findPersonaPath 的 PG BFS 回退语义不变）。
   * 输入：bookId。
   * 副作用：写 Neo4j 图。
   */
  async function syncNeo4jBookGraph(bookId: string): Promise<void> {
    const driver = getNeo4jDriver();
    if (!driver) {
      return;
    }

    // Neo4j 是查询缓存（PG 为权威源）：连接不可达时跳过同步，不使分析任务失败。
    try {
      await syncNeo4jGraphWithDriver(driver, bookId);
    } catch (error) {
      console.error(`[neo4j] 图同步跳过（连接不可达）: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /** 用已建 Driver 执行全书图同步（连接异常由 syncNeo4jBookGraph 兜底跳过）。 */
  async function syncNeo4jGraphWithDriver(
    driver: NonNullable<ReturnType<typeof getNeo4jDriver>>,
    bookId: string
  ): Promise<void> {
    const [relationships, entityProfiles] = await Promise.all([
      prismaClient.relationship.findMany({
        where: {
          bookId,
          deletedAt: null,
          status   : { in: ["DRAFT", "VERIFIED"] },
          source   : { deletedAt: null },
          target   : { deletedAt: null }
        },
        select: {
          id                  : true,
          sourceEntityId      : true,
          targetEntityId      : true,
          relationshipTypeCode: true,
          firstChapterId      : true,
          firstChapterNo      : true
        }
      }),
      prismaClient.entityProfile.findMany({
        where : { bookId, deletedAt: null, entity: { deletedAt: null } },
        select: { entity: { select: { id: true, name: true } } }
      })
    ]);

    const personas: Array<{ id: string; name: string }> = entityProfiles.map((p) => p.entity);
    const personaIdSet = new Set(personas.map((p) => p.id));
    for (const edge of relationships) {
      personaIdSet.add(edge.sourceEntityId);
      personaIdSet.add(edge.targetEntityId);
    }
    // 关系边可能引用无档案实体，补查名字避免节点缺名
    const missingIds = Array.from(personaIdSet).filter((id) => !personas.some((p) => p.id === id));
    if (missingIds.length > 0) {
      const extras = await prismaClient.entity.findMany({
        where : { id: { in: missingIds }, deletedAt: null },
        select: { id: true, name: true }
      });
      personas.push(...extras);
    }

    const edges = relationships.map((r) => ({
      id       : r.id,
      sourceId : r.sourceEntityId,
      targetId : r.targetEntityId,
      type     : r.relationshipTypeCode,
      weight   : 1,
      chapterId: r.firstChapterId ?? "",
      chapterNo: r.firstChapterNo ?? 0
    }));

    const session = driver.session();
    try {
      // 节点 MERGE（增量更新）
      await session.run(
        `
        UNWIND $personas AS persona
        MERGE (p:Persona {id: persona.id, bookId: $bookId})
        SET p.name = persona.name
        `,
        { bookId, personas }
      );
      // 边按 bookId 全删重建，避免历史残边污染
      await session.run(
        `
        MATCH ()-[r:RELATES {bookId: $bookId}]->()
        DELETE r
        `,
        { bookId }
      );
      await session.run(
        `
        UNWIND $edges AS edge
        MATCH (source:Persona {id: edge.sourceId, bookId: $bookId})
        MATCH (target:Persona {id: edge.targetId, bookId: $bookId})
        MERGE (source)-[r:RELATES {id: edge.id, bookId: $bookId}]->(target)
        SET r.type = edge.type,
            r.weight = edge.weight,
            r.chapterId = edge.chapterId,
            r.chapterNo = edge.chapterNo
        `,
        { bookId, edges }
      );
    } finally {
      await session.close();
    }
  }

  /**
   * 功能：Pass5——markOrphan（FULL_BOOK 门控）+ SkillGenerator 候选 DRAFT。
   * 输入：bookId/jobId/scope。
   * 副作用：实体置信度降级；可能创建 DRAFT 技能包。
   */
  async function runPass5(input: { bookId: string; jobId: string; scope: AnalysisScope }): Promise<void> {
    // markOrphan 仅 FULL_BOOK（全局孤儿判断只在全书任务有意义）
    if (input.scope === "FULL_BOOK") {
      await markOrphan(input.bookId);
    }

    // SkillGenerator：候选 DRAFT 交管理员确认启用；无信号时跳过（避免空生成报错）
    const signals = await collectSkillSignals(input.bookId, input.jobId);
    const hasSignals =
      (signals.frequentTitles?.length ?? 0)
      + (signals.unknownRelationshipCodes?.length ?? 0)
      + (signals.newNamePatterns?.length ?? 0)
      > 0;
    if (hasSignals) {
      const { skillGenerator } = await import("@/server/modules/skills/skillGenerator");
      await skillGenerator.generateSkillFromSignals(signals);
    }
  }

  // ===========================================================================
  // 入口
  // ===========================================================================

  /**
   * 功能：执行一次分析任务（入口，analyze route 直接调用）。
   * 输入：jobId。
   * 输出：无（失败抛错由调用方记录日志）。
   * 异常：任务不存在 / 各 Pass 失败。
   * 副作用：整个管线写入。
   */
  async function runAnalysisJobById(jobId: string): Promise<void> {
    // 乐观抢占：被其他 runner 处理则直接返回。
    const claimed = await claimQueuedJob(jobId);
    if (!claimed) {
      return;
    }

    let context: { jobId: string; bookId: string; scope: AnalysisScope; chapters: ChapterRef[] };
    try {
      context = await loadJobContext(jobId);
    } catch (error) {
      // job 不存在时无法定位 book，直接标记失败。
      await writeTerminalState(jobId, "", false, error instanceof Error ? error.message : String(error));
      return;
    }

    try {
      await runPipeline(context);
      await writeTerminalState(context.jobId, context.bookId, true);
    } catch (error) {
      // 取消：跳过终态写入，保留 CANCELED 状态。
      if (error instanceof JobCanceledError) {
        return;
      }
      await writeTerminalState(context.jobId, context.bookId, false, error instanceof Error ? error.message : String(error));
    }
  }

  /**
   * 功能：管线主体，编排 Pass0-5（硬时序：Tier1→Tier2→提取→reconcile→聚合→自动接受→终态）。
   * 输入：job 上下文（含按 scope 选好的目标章节）。
   * 异常：取消时抛 JobCanceledError；各 Pass 失败上抛由入口决定终态。
   * 副作用：快照装载、Pass0-5 全部写入。
   */
  async function runPipeline(context: {
    jobId   : string;
    bookId  : string;
    scope   : AnalysisScope;
    chapters: ChapterRef[];
  }): Promise<void> {
    // 取消贯穿：每个 Pass 前检查，CANCELED 提前退出（抛哨兵由入口跳过终态，不覆盖取消）。
    async function checkCanceled(): Promise<void> {
      if (await isJobCanceled(context.jobId)) {
        throw new JobCanceledError();
      }
    }

    await checkCanceled();

    if (context.chapters.length === 0) {
      throw new Error("目标章节为空，无法执行分析");
    }

    // 任务启动快照：skills + relationshipTypes（selectSkillsForJob 落快照，装载从中读取）。
    const { skillSelector } = await import("@/server/modules/skills/skillSelector");
    const { skillLoader } = await import("@/server/modules/skills/loader");
    await skillSelector.selectSkillsForJob({ bookId: context.bookId, jobId: context.jobId });
    const resolved = await skillLoader.resolveSkillsForJob(context.jobId);
    const skillDocs = resolved.skills.map((skill) => skill.markdown);

    // 关系码契约：任务快照（防中途改配置导致片间漂移）。
    const job = await prismaClient.analysisJob.findUnique({
      where : { id: context.jobId },
      select: { relationshipTypesSnapshot: true }
    });
    const relationshipTypeCodes = relationshipCodesFromSnapshot(job?.relationshipTypesSnapshot).map((r) => r.code);

    // 重置目标章节解析状态 + 初始化 book 状态（重跑语义：旧状态不残留，幂等）。
    await prismaClient.chapter.updateMany({
      where: { id: { in: context.chapters.map((c) => c.id) } },
      data : { parseStatus: "PENDING" }
    });
    await prismaClient.book.update({
      where : { id: context.bookId },
      select: { id: true },
      data  : { status: "PROCESSING", errorLog: null }
    });

    // 数据准备：全书摘要（Pass1 提取消费）。
    const bookSummary = await buildBookSummary(context.bookId);

    // Pass1：逐章提取 + 落库（无身份登记表 → 临时实体 + facts + mentions，章内共指；
    // 身份判定留给后续全局 Pass。v7 时序：提取先于身份）。
    const entityIdByName = new Map<string, string>();
    await checkCanceled();
    await setStage(context.jobId, "extraction");
    await traceAgentRun(context.bookId, context.jobId, AgentRunType.EXTRACTION, async (agentRunId) => {
      await runPass1Slices({
        bookId  : context.bookId,
        jobId   : context.jobId,
        agentRunId,
        chapters: context.chapters,
        bookSummary,
        skills  : skillDocs,
        relationshipTypeCodes,
        entityIdByName
      });
    });

    // Pass1.5 身份 Pass + Pass1.75 确定性归并（提取产出去重表面形式 → 全局折叠 → 合并）。
    await checkCanceled();
    await setStage(context.jobId, "identity");
    await traceAgentRun(context.bookId, context.jobId, AgentRunType.IDENTITY, async (agentRunId) => {
      await runIdentityAndProjection({
        bookId: context.bookId,
        jobId : context.jobId,
        agentRunId
      });
    });

    // Pass3：别名合并 + 幂等重建 relationships + Neo4j 惰性同步。
    await checkCanceled();
    await setStage(context.jobId, "aggregate");
    await traceAgentRun(context.bookId, context.jobId, AgentRunType.VALIDATION, async () => {
      await runPass3(context.bookId);
    });

    // Pass4：自动接受栈（五条件；冲突扫描结果接入条件④）。
    await checkCanceled();
    await setStage(context.jobId, "auto_accept");
    await runPass4(context.bookId, context.jobId);

    // Pass5：markOrphan（FULL_BOOK 门控）+ SkillGenerator 候选 DRAFT；终态由入口落库。
    await checkCanceled();
    await setStage(context.jobId, "skill_generation");
    await traceAgentRun(context.bookId, context.jobId, AgentRunType.SKILL_GENERATION, async () => {
      await runPass5({ bookId: context.bookId, jobId: context.jobId, scope: context.scope });
    });
  }

  return {
    runAnalysisJobById,
    runNextAnalysisJob: runAnalysisJobById
  };
}

/** 默认导出实例：生产代码直接复用；测试注入 mock PrismaClient。 */
export const runAnalysisJobById = createAnalysisJobRunner(prisma).runAnalysisJobById;
export const runNextAnalysisJob = createAnalysisJobRunner(prisma).runNextAnalysisJob;
