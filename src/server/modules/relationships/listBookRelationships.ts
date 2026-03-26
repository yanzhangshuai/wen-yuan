import type { PrismaClient } from "@/generated/prisma/client";
import { type ProcessingStatus, type RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 关系列表筛选条件。
 */
export interface ListBookRelationshipsFilter {
  /** 按关系类型过滤。 */
  type?  : string;
  /** 按审核状态过滤。 */
  status?: ProcessingStatus;
  /** 按数据来源过滤（AI / MANUAL）。 */
  source?: RecordSource;
}

/**
 * 书籍关系列表项。
 */
export interface BookRelationshipListItem {
  /** 关系主键 ID。 */
  id          : string;
  /** 所属书籍 ID。 */
  bookId      : string;
  /** 所属章节 ID。 */
  chapterId   : string;
  /** 所属章节序号。 */
  chapterNo   : number;
  /** 起点人物 ID。 */
  sourceId    : string;
  /** 起点人物名称。 */
  sourceName  : string;
  /** 终点人物 ID。 */
  targetId    : string;
  /** 终点人物名称。 */
  targetName  : string;
  /** 关系类型。 */
  type        : string;
  /** 关系权重。 */
  weight      : number;
  /** 关系背景描述。 */
  description : string | null;
  /** 原文证据片段。 */
  evidence    : string | null;
  /** AI/人工置信度。 */
  confidence  : number;
  /** 数据来源。 */
  recordSource: RecordSource;
  /** 审核状态。 */
  status      : ProcessingStatus;
}

export function createListBookRelationshipsService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取指定书籍的关系列表（支持筛选）。
   * 输入：`bookId` + 可选筛选条件。
   * 输出：按更新时间倒序的关系列表。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function listBookRelationships(
    bookId: string,
    filter: ListBookRelationshipsFilter = {}
  ): Promise<BookRelationshipListItem[]> {
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    const relationships = await prismaClient.relationship.findMany({
      where: {
        deletedAt: null,
        chapter  : { bookId },
        source   : { deletedAt: null },
        target   : { deletedAt: null },
        ...(filter.type ? { type: filter.type } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.source ? { recordSource: filter.source } : {})
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        id          : true,
        chapterId   : true,
        type        : true,
        weight      : true,
        description : true,
        evidence    : true,
        confidence  : true,
        recordSource: true,
        status      : true,
        sourceId    : true,
        targetId    : true,
        source      : {
          select: {
            name: true
          }
        },
        target: {
          select: {
            name: true
          }
        },
        chapter: {
          select: {
            no: true
          }
        }
      }
    });

    return relationships.map((item) => ({
      id          : item.id,
      bookId,
      chapterId   : item.chapterId,
      chapterNo   : item.chapter.no,
      sourceId    : item.sourceId,
      sourceName  : item.source.name,
      targetId    : item.targetId,
      targetName  : item.target.name,
      type        : item.type,
      weight      : item.weight,
      description : item.description,
      evidence    : item.evidence,
      confidence  : item.confidence,
      recordSource: item.recordSource,
      status      : item.status
    }));
  }

  return {
    listBookRelationships
  };
}

export const { listBookRelationships } = createListBookRelationshipsService();
