/**
 * =============================================================================
 * 文件定位（服务层：书内关系人工补全）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/relationships/createBookRelationship.ts`
 *
 * 模块职责：
 * - 在指定书籍下创建或恢复一条书级人物关系；
 * - 通过关系类型字典校验与对称关系 canonicalize，保证同一关系不会反向重复。
 *
 * 业务语义：
 * - 人工写入默认升级为 `MANUAL + VERIFIED`；
 * - 关系证据不再写入主表，章节级证据由 `RelationshipEvent` 承载。
 * =============================================================================
 */
import { Prisma, type PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";
import { RelationshipInputError } from "@/server/modules/relationships/errors";

export interface CreateBookRelationshipInput {
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
}

export interface CreateBookRelationshipResult {
  id                  : string;
  bookId              : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  recordSource        : RecordSource;
  status              : ProcessingStatus;
}

const CREATE_RELATIONSHIP_SELECT = {
  id                  : true,
  bookId              : true,
  sourceId            : true,
  targetId            : true,
  relationshipTypeCode: true,
  recordSource        : true,
  status              : true
} as const;

function isUniqueConstraintError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002";
}

export function createCreateBookRelationshipService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 手工创建书级关系。对称关系先按 UUID 字符串排序，避免 A-B 与 B-A 形成两条边。
   */
  async function createBookRelationship(
    bookId: string,
    input: CreateBookRelationshipInput
  ): Promise<CreateBookRelationshipResult> {
    if (input.sourceId === input.targetId) {
      throw new RelationshipInputError("关系起点和终点不能相同");
    }

    const runWrite = async () => prismaClient.$transaction(async (tx) => {
      const book = await tx.book.findFirst({
        where: {
          id       : bookId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!book) {
        throw new BookNotFoundError(bookId);
      }

      const personas = await tx.persona.findMany({
        where: {
          id       : { in: [input.sourceId, input.targetId] },
          deletedAt: null
        },
        select: { id: true }
      });
      const source = personas.find((item) => item.id === input.sourceId);
      if (!source) {
        throw new PersonaNotFoundError(input.sourceId);
      }
      const target = personas.find((item) => item.id === input.targetId);
      if (!target) {
        throw new PersonaNotFoundError(input.targetId);
      }

      const relationshipTypeCode = input.relationshipTypeCode.trim();
      const relationshipType = await tx.relationshipTypeDefinition.findFirst({
        where : { code: relationshipTypeCode, status: "ACTIVE" },
        select: { code: true, directionMode: true }
      });
      if (!relationshipType) {
        throw new RelationshipInputError("关系类型未启用");
      }

      let sourceId = source.id;
      let targetId = target.id;
      if (relationshipType.directionMode === "SYMMETRIC" && sourceId > targetId) {
        sourceId = target.id;
        targetId = source.id;
      }

      const existingRelationship = await tx.relationship.findFirst({
        where: {
          bookId,
          sourceId,
          targetId,
          relationshipTypeCode,
          deletedAt: null
        },
        select: { id: true }
      });

      if (existingRelationship) {
        return tx.relationship.update({
          where: { id: existingRelationship.id },
          data : {
            recordSource: RecordSource.MANUAL,
            status      : ProcessingStatus.VERIFIED,
            deletedAt   : null
          },
          select: CREATE_RELATIONSHIP_SELECT
        });
      }

      return tx.relationship.create({
        data: {
          bookId,
          sourceId,
          targetId,
          relationshipTypeCode,
          recordSource: RecordSource.MANUAL,
          status      : ProcessingStatus.VERIFIED
        },
        select: CREATE_RELATIONSHIP_SELECT
      });
    });

    try {
      return await runWrite();
    } catch (error) {
      if (!isUniqueConstraintError(error)) {
        throw error;
      }

      return await runWrite();
    }
  }

  return {
    createBookRelationship
  };
}

export const { createBookRelationship } = createCreateBookRelationshipService();
