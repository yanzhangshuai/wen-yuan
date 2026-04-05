import { type ChapterType } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import {
  splitRawContentToChapterDrafts
} from "@/server/modules/books/chapterSplit";
import {
  BookNotFoundError,
  BookSourceFileMissingError
} from "@/server/modules/books/errors";
import { provideStorage, type StorageProviderClient } from "@/server/providers/storage";

/**
 * 文件定位（服务端书籍模块 / 章节预览）：
 * - 该服务用于在“未正式入库章节实体前”基于原始文本做章节切分预览。
 * - 被 `/api/books/:id/chapters/preview` route 调用，属于后端数据访问 + 文本处理桥接层。
 *
 * 执行环境：
 * - Node.js 服务端（依赖 Prisma 与对象存储，不可在浏览器执行）。
 */

export interface ChapterPreviewItem {
  /** 切分后的章节序号（从 1 递增）。 */
  index      : number;
  /** 章节类型（正文/卷/序等），来自切分算法输出。 */
  chapterType: ChapterType;
  /** 章节标题。 */
  title      : string;
  /** 章节字数，用于预估切分质量。 */
  wordCount  : number;
}

export interface ChapterPreviewResult {
  /** 书籍 ID。 */
  bookId      : string;
  /** 切分出的章节总数。 */
  chapterCount: number;
  /** 章节预览列表。 */
  items       : ChapterPreviewItem[];
}

/**
 * 把切分草稿转换为 API 预览结构。
 * 设计原因：隔离 chapterSplit 内部结构，避免下游直接依赖底层实现细节。
 */
export function splitRawContentToChapterPreview(rawContent: string): ChapterPreviewItem[] {
  return splitRawContentToChapterDrafts(rawContent).map((item) => ({
    index      : item.index,
    chapterType: item.chapterType,
    title      : item.title,
    wordCount  : item.wordCount
  }));
}

/**
 * 对书籍文件做文本解码。
 * 分支原因：
 * - 先尝试 UTF-8 严格解码（fatal=true），可及时暴露坏字节；
 * - 失败后回退 GB18030，兼容中文古籍常见编码来源。
 */
export function decodeBookText(fileBuffer: Buffer): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(fileBuffer);
  } catch {
    return new TextDecoder("gb18030").decode(fileBuffer);
  }
}

export function createGetChapterPreviewService(
  prismaClient: PrismaClient = prisma,
  storageClient: StorageProviderClient = provideStorage()
) {
  /**
   * 获取书籍章节预览。
   * 上下游：
   * - 上游输入：路由层传入的 bookId；
   * - 下游输出：route 层会直接包装成 API 成功响应。
   */
  async function getChapterPreview(bookId: string): Promise<ChapterPreviewResult> {
    // 先校验书籍存在且未删除，防止后续读取存储资源出现“越权/脏读”。
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: {
        id           : true,
        sourceFileKey: true
      }
    });

    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    if (!book.sourceFileKey) {
      // 业务含义：书籍尚未上传源文件或元数据损坏，无法进行章节切分。
      throw new BookSourceFileMissingError(bookId);
    }

    // 读取原文文件 -> 解码 -> 切分，形成章节预览。
    const fileBuffer = await storageClient.getObject(book.sourceFileKey);
    const rawContent = decodeBookText(fileBuffer);
    const items = splitRawContentToChapterPreview(rawContent);

    return {
      bookId      : book.id,
      chapterCount: items.length,
      items
    };
  }

  return { getChapterPreview };
}

export const { getChapterPreview } = createGetChapterPreviewService();
export { BookNotFoundError, BookSourceFileMissingError } from "@/server/modules/books/errors";
