import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { normalizeBookStatus, type BookLibraryListItem } from "@/types/book";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/books/getBookById.ts`
 * ----------------------------------------------------------------------------
 * 这是书籍域的服务端查询模块，职责是“按 bookId 聚合书籍详情 DTO”。
 *
 * 分层角色：
 * - 属于 server modules（服务端逻辑层）；
 * - 被 route handler 调用，不直接处理 HTTP；
 * - 通过 Prisma 读取多表数据并映射成前端可用结构。
 *
 * 业务目标：
 * - 返回书籍卡片/详情页所需的聚合字段；
 * - 包括章节数、人物数、最近分析时间、当前模型、错误摘要、源文件信息。
 *
 * 设计原则：
 * - 读路径只抛领域错误（如 BookNotFoundError），HTTP 映射交给 route 层；
 * - DTO 映射在服务层统一完成，避免路由层散落字段拼装逻辑。
 * ============================================================================
 */

/**
 * Prisma 查询结果行类型（内部结构）。
 * 说明：这是“查询投影模型”，不是对外 API contract。
 */
interface BookDetailRow {
  /** 书籍主键。 */
  id            : string;
  /** 书名。 */
  title         : string;
  /** 作者。 */
  author        : string | null;
  /** 朝代。 */
  dynasty       : string | null;
  /** 简介（当前 DTO 未直接输出，但保留查询位以便后续扩展）。 */
  description   : string | null;
  /** 封面 URL。 */
  coverUrl      : string | null;
  /** 原始状态字符串（需经 normalizeBookStatus 归一化）。 */
  status        : string;
  /** 书级错误摘要。 */
  errorLog      : string | null;
  /** 创建时间。 */
  createdAt     : Date;
  /** 更新时间。 */
  updatedAt     : Date;
  /** 源文件对象存储 key。 */
  sourceFileKey : string | null;
  /** 源文件访问 URL。 */
  sourceFileUrl : string | null;
  /** 源文件原始文件名。 */
  sourceFileName: string | null;
  /** 源文件 MIME 类型。 */
  sourceFileMime: string | null;
  /** 源文件大小（字节）。 */
  sourceFileSize: number | null;
  /** 章节列表（这里只取 id，用于计数）。 */
  chapters      : Array<{ id: string }>;
  /** 人物档案列表（这里只取 id，用于计数）。 */
  profiles      : Array<{ id: string }>;
  /** 最近分析任务快照（只取最新 1 条）。 */
  analysisJobs: Array<{
    updatedAt   : Date;
    finishedAt  : Date | null;
    errorLog    : string | null;
    architecture: string;
    phaseLogs   : Array<{
      model: {
        name: string;
      } | null;
    }>;
  }>;
}

/**
 * 推导最近分析时间。
 *
 * 分支原因：
 * 1) 优先 finishedAt：任务完整结束时间最准确；
 * 2) 次选 updatedAt：任务进行中也能反映最近活跃时间；
 * 3) 若无任务：
 *    - PENDING 返回 null（业务含义：尚未开始分析）；
 *    - 其他状态回退 book.updatedAt（兼容历史数据）。
 */
function resolveLastAnalyzedAt(
  status: ReturnType<typeof normalizeBookStatus>,
  updatedAt: Date,
  analysisJobs: BookDetailRow["analysisJobs"]
): string | null {
  return analysisJobs[0]?.finishedAt?.toISOString()
    ?? analysisJobs[0]?.updatedAt.toISOString()
    ?? (status === "PENDING" ? null : updatedAt.toISOString());
}

/**
 * 把内部查询行映射为对外 DTO（`BookLibraryListItem`）。
 * 设计目的：把状态归一、时间格式化、来源字段组装集中在一个函数里，降低上游误改风险。
 */
function mapBookDetail(book: BookDetailRow): BookLibraryListItem {
  const status = normalizeBookStatus(book.status);
  const currentModel = book.analysisJobs?.[0]?.phaseLogs?.[0]?.model?.name ?? null;
  const rawArchitecture = book.analysisJobs?.[0]?.architecture ?? null;
  const lastArchitecture = rawArchitecture === "twopass"
    ? "twopass"
    : rawArchitecture === "sequential"
      ? "sequential"
      : null;
  const lastErrorSummary = book.errorLog ?? book.analysisJobs[0]?.errorLog ?? null;

  return {
    id            : book.id,
    title         : book.title,
    author        : book.author,
    dynasty       : book.dynasty,
    coverUrl      : book.coverUrl,
    status,
    chapterCount  : book.chapters.length,
    personaCount  : book.profiles.length,
    lastAnalyzedAt: resolveLastAnalyzedAt(status, book.updatedAt, book.analysisJobs),
    currentModel,
    lastArchitecture,
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

export function createGetBookByIdService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取单本书详情。
   * 输入：`bookId`。
   * 输出：`BookLibraryListItem`（与书库卡片结构兼容）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function getBookById(bookId: string): Promise<BookLibraryListItem> {
    // 查询时明确过滤 deletedAt，保证业务上“软删除不可见”。
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id            : true,
        title         : true,
        author        : true,
        dynasty       : true,
        description   : true,
        coverUrl      : true,
        status        : true,
        errorLog      : true,
        createdAt     : true,
        updatedAt     : true,
        sourceFileKey : true,
        sourceFileUrl : true,
        sourceFileName: true,
        sourceFileMime: true,
        sourceFileSize: true,
        chapters      : {
          select: {
            id: true
          }
        },
        profiles: {
          where : { deletedAt: null },
          select: {
            id: true
          }
        },
        analysisJobs: {
          // 只拿最新任务，避免无谓数据量。
          take   : 1,
          orderBy: { updatedAt: "desc" },
          select : {
            updatedAt   : true,
            finishedAt  : true,
            errorLog    : true,
            architecture: true,
            phaseLogs   : {
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
        }
      }
    });

    if (!book) {
      // 由 route 层决定映射为 404。
      throw new BookNotFoundError(bookId);
    }

    // 查询结果映射成统一 DTO，供上游直接返回给前端。
    return mapBookDetail(book as BookDetailRow);
  }

  return { getBookById };
}

export const { getBookById } = createGetBookByIdService();
