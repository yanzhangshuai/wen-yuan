/**
 * =============================================================================
 * 文件定位（服务层：书籍关系列表查询）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/relationships/listBookRelationships.ts`
 *
 * 模块职责：
 * - 查询指定书籍的书级关系；
 * - 聚合关系事件数量与最早章节号，供关系抽屉和审核列表展示。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { type ProcessingStatus, type RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { lookupRelationshipTypeNames } from "@/server/modules/knowledge/lookupTypeNames";

export interface ListBookRelationshipsFilter {
  relationshipTypeCode?: string;
  status?              : ProcessingStatus;
  source?              : RecordSource;
}

export interface BookRelationshipListItem {
  id                  : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  relationshipTypeName: string;
  recordSource        : RecordSource;
  status              : ProcessingStatus;
  chapterNo           : number | null;
}

export function createListBookRelationshipsService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 使用两步查询聚合事件统计，避免对每条关系单独查询事件造成 N+1。
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
        bookId,
        deletedAt: null,
        source   : { deletedAt: null },
        target   : { deletedAt: null },
        ...(filter.relationshipTypeCode ? { relationshipTypeCode: filter.relationshipTypeCode } : {}),
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.source ? { recordSource: filter.source } : {})
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        id                  : true,
        sourceId            : true,
        targetId            : true,
        relationshipTypeCode: true,
        recordSource        : true,
        status              : true,
        chapterNo           : true
      }
    });

    if (relationships.length === 0) {
      return [];
    }

    const [nameByCode] = await Promise.all([
      lookupRelationshipTypeNames(relationships.map((r) => r.relationshipTypeCode), prismaClient)
    ]);

    return relationships.map((relationship) => {
      return {
        id                  : relationship.id,
        sourceId            : relationship.sourceId,
        targetId            : relationship.targetId,
        relationshipTypeCode: relationship.relationshipTypeCode,
        relationshipTypeName: nameByCode.get(relationship.relationshipTypeCode) ?? relationship.relationshipTypeCode,
        recordSource        : relationship.recordSource,
        status              : relationship.status,
        chapterNo           : relationship.chapterNo
      };
    });
  }

  return {
    listBookRelationships
  };
}

export const { listBookRelationships } = createListBookRelationshipsService();
