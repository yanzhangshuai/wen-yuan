import type { PrismaClient } from "@/generated/prisma/client";
import { normalizeBookStatus, type BookLibraryListItem } from "@/types/book";
import { prisma } from "@/server/db/prisma";

/**
 * =============================================================================
 * 文件定位（书籍域服务端查询模块）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/books/listBooks.ts`
 * 所属层次：服务端逻辑层（Server Module / Data Access Orchestration）
 *
 * 在 Next.js 应用中的位置：
 * - 该文件不直接对应路由文件，不被客户端直接调用；
 * - 由 Server Component（如 `/admin/books` 页面）在服务端执行时调用；
 * - 负责把 Prisma 原始查询结果映射成前端稳定契约 `BookLibraryListItem`。
 *
 * 核心业务职责：
 * 1) 查询“未删除”书籍列表及其统计信息；
 * 2) 组合最近一次解析任务快照（模型名、错误摘要、时间）；
 * 3) 统一状态值（`normalizeBookStatus`）与输出字段，降低上层分支复杂度。
 *
 * 上下游关系：
 * - 上游：管理端书库页面 Server Component；
 * - 下游：Prisma `book.findMany` 查询（数据库）；
 * - 输出：`BookLibraryListItem[]`（客户端列表可直接消费）。
 *
 * 维护注意：
 * - `BOOK_LIST_SELECT` 是查询契约核心，字段删改会直接影响列表展示与类型安全；
 * - `analysisJobs.take = 1` 是“取最近任务快照”的业务策略，不是技术限制；
 * - `mapBook` 的字段命名属于跨层契约，改名需联动 `types/book.ts` 与前端组件。
 * =============================================================================
 */

/**
 * 书库查询行结构（数据库层 DTO）。
 *
 * 说明：
 * - 此类型用于描述 Prisma `select` 返回结构；
 * - 不是直接给前端的最终 VO，需要经过 `mapBook` 归一化。
 */
interface BookListRow {
  /** 书籍主键。 */
  id       : string;
  /** 书名。 */
  title    : string;
  /** 作者（可空表示未录入）。 */
  author   : string | null;
  /** 朝代（可空表示未知）。 */
  dynasty  : string | null;
  /** 封面图 URL（可空）。 */
  coverUrl : string | null;
  /** 原始状态字符串（数据库可扩展，前端需归一化）。 */
  status   : string;
  /** 书籍创建时间。 */
  createdAt: Date;
  /** 书籍更新时间。 */
  updatedAt: Date;
  /** 书级错误日志摘要。 */
  errorLog : string | null;
  /** 计数字段：章节数与有效人物数。 */
  _count: {
    /** 章节总数。 */
    chapters      : number;
    /**
     * 有效人物数（口径：PERSON 类型 ∧ 实体未软删 ∧ profile 未软删 ∧ 本书内 ≥1 提及）。
     * v7：不再把 LOCATION/ORG/CONCEPT / 0 提及垃圾混入"人物"列。
     */
    entityProfiles: number;
  };
  /** 最近一次解析任务快照（按 updatedAt 倒序，取 1 条）。 */
  analysisJobs: Array<{
    /** 任务更新时间（任务级回退时间）。 */
    updatedAt : Date;
    /** 任务完成时间（优先用于最近解析时间展示）。 */
    finishedAt: Date | null;
    /** 任务错误摘要（书级错误缺失时的回退来源）。 */
    errorLog  : string | null;
    /** 最近阶段日志（取 1 条，用于提取模型名）。 */
    phaseLogs   : Array<{
      model: {
        /** 模型展示名。 */
        name: string;
      } | null;
    }>;
  }>;
  /** 源文件存储 key。 */
  sourceFileKey : string | null;
  /** 源文件访问 URL。 */
  sourceFileUrl : string | null;
  /** 源文件原始名称。 */
  sourceFileName: string | null;
  /** 源文件 MIME 类型。 */
  sourceFileMime: string | null;
  /** 源文件大小（字节）。 */
  sourceFileSize: number | null;
}

/**
 * Prisma 查询选择集。
 *
 * 业务含义：
 * - 只取列表展示所需字段，避免过度查询；
 * - `entityProfiles` 只统计未软删实体档案，保证后台统计口径一致；
 * - 解析任务仅取最近一条，满足列表“当前状态快照”需求。
 */
const BOOK_LIST_SELECT = {
  id       : true,
  title    : true,
  author   : true,
  dynasty  : true,
  coverUrl : true,
  status   : true,
  createdAt: true,
  updatedAt: true,
  errorLog : true,
  _count   : {
    select: {
      chapters      : true,
      entityProfiles: true
    }
  },
  analysisJobs: {
    take   : 1,
    orderBy: { updatedAt: "desc" },
    select : {
      updatedAt : true,
      finishedAt: true,
      errorLog  : true,
      phaseLogs : {
        take   : 1,
        orderBy: { createdAt: "desc" },
        select : {
          model: {
            select: {
              name: true
            }
          }
        }
      }
    }
  },
  sourceFileKey : true,
  sourceFileUrl : true,
  sourceFileName: true,
  sourceFileMime: true,
  sourceFileSize: true
} as const;

/**
 * 推导“最近解析时间”。
 *
 * 规则优先级（业务规则，不是技术限制）：
 * 1) 最近任务完成时间（最准确表示“解析完成”时刻）；
 * 2) 最近任务更新时间（任务进行中或未完成时的近似时间）；
 * 3) 若书籍状态非 PENDING，则回退书籍更新时间；
 * 4) 仍无法判断时返回 null。
 *
 * @param status 归一化后的书籍状态
 * @param updatedAt 书籍更新时间
 * @param analysisJobs 最近任务数组（通常最多 1 条）
 * @returns ISO 时间字符串或 null
 */
function resolveLastAnalyzedAt(
  status: ReturnType<typeof normalizeBookStatus>,
  updatedAt: Date,
  analysisJobs: BookListRow["analysisJobs"]
): string | null {
  return analysisJobs[0]?.finishedAt?.toISOString()
    ?? analysisJobs[0]?.updatedAt.toISOString()
    ?? (status === "PENDING" ? null : updatedAt.toISOString());
}

/**
 * 将数据库查询结果映射为前端书库列表项。
 *
 * @param book 原始查询行
 * @returns `BookLibraryListItem`（前端稳定契约）
 */
function mapBook(book: BookListRow, personaCount: number): BookLibraryListItem {
  // 归一化状态，防止历史脏数据或扩展状态直接污染前端分支。
  const status = normalizeBookStatus(book.status);

  // 当前模型展示策略：取“最近任务 -> 最近阶段日志”的模型名。
  // 原因：Book/AnalysisJob 已不直接维护 aiModel 关系，阶段日志才是实际执行来源。
  const currentModel = book.analysisJobs[0]?.phaseLogs?.[0]?.model?.name ?? null;

  // 错误摘要优先级：书级错误 > 最近任务错误。
  // 这样可以让列表优先显示更接近业务实体（书籍）的问题描述。
  const lastErrorSummary = book.errorLog ?? book.analysisJobs[0]?.errorLog ?? null;

  return {
    id            : book.id,
    title         : book.title,
    author        : book.author,
    dynasty       : book.dynasty,
    coverUrl      : book.coverUrl,
    status,
    chapterCount  : book._count.chapters,
    personaCount,
    lastAnalyzedAt: resolveLastAnalyzedAt(status, book.updatedAt, book.analysisJobs),
    currentModel,
    lastErrorSummary,
    createdAt     : book.createdAt.toISOString(),
    updatedAt     : book.updatedAt.toISOString(),
    sourceFile    : {
      key : book.sourceFileKey,
      url : book.sourceFileUrl,
      name: book.sourceFileName,
      mime: book.sourceFileMime,
      size: book.sourceFileSize
    }
  };
}

/**
 * 统计每本书的有效人物数。
 *
 * 口径（v7）：PERSON 类型 ∧ 实体未软删 ∧ profile 未软删 ∧ 本书内 mention ≥1。
 * 语义：一个人物必须是"有证据锚定（≥1 提及）+ 有身份（PERSON）+ 未被归并吸收"的实体；
 * 0 提及/从属指称/被吸收残留不再计入"人物"列。
 *
 * @param bookIds 目标书集
 * @param prismaClient Prisma 客户端（默认全局实例）
 * @returns bookId → 有效人物数
 */
export async function countEffectivePersonas(
  bookIds: string[],
  prismaClient: PrismaClient = prisma
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (bookIds.length === 0) {
    return result;
  }

  // 有效提及（本书内、未删、未拒）：persona 的存在证据。
  const mentions = await prismaClient.mention.findMany({
    where   : { chapter: { bookId: { in: bookIds } }, deletedAt: null, status: { not: "REJECTED" } },
    select  : { entityId: true, chapter: { select: { bookId: true } } },
    distinct: ["entityId", "chapterId"]
  });

  const entityIds = Array.from(new Set(mentions.map((m) => m.entityId)));
  if (entityIds.length === 0) {
    return result;
  }

  const profiles = await prismaClient.entityProfile.findMany({
    where: {
      bookId   : { in: bookIds },
      deletedAt: null,
      entityId : { in: entityIds },
      entity   : { deletedAt: null, entityType: "PERSON" }
    },
    select: { entityId: true, bookId: true }
  });

  for (const p of profiles) {
    result.set(p.bookId, (result.get(p.bookId) ?? 0) + 1);
  }
  return result;
}

/**
 * 创建 `listBooks` 服务（支持依赖注入）。
 *
 * @param prismaClient Prisma 客户端实例；默认使用全局 `prisma`
 * @returns 包含 `listBooks` 的服务对象
 */
export function createListBooksService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 查询书库列表（按更新时间倒序）。
   *
   * 业务语义：
   * - 只返回未软删书籍；
   * - 倒序保证“最近更新的书”优先出现在列表顶部，符合管理操作习惯。
   *
   * @returns 书库列表（前端契约）
   */
  async function listBooks(): Promise<BookLibraryListItem[]> {
    const books = await prismaClient.book.findMany({
      where  : { deletedAt: null },
      orderBy: { updatedAt: "desc" },
      select : BOOK_LIST_SELECT
    });

    // 有效人物统计：每本书 PERSON ∧ 实体未软删 ∧ profile 未软删 ∧ 本书内 mention ≥1。
    // 不依赖 _count 嵌套（无法表达"本书内 mention"），独立聚合。
    const personaCountByBook = await countEffectivePersonas(books.map((b) => b.id), prismaClient);

    return books.map((book) => mapBook(book, personaCountByBook.get(book.id) ?? 0));
  }

  return { listBooks };
}

/**
 * 默认服务实例。
 * 供应用直接调用，避免每个调用方重复构造。
 */
export const { listBooks } = createListBooksService();
