/**
 * =============================================================================
 * 文件定位（服务层：关系更新）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/relationships/updateRelationship.ts`
 *
 * 模块职责：
 * - 对单条书级关系执行部分字段更新；
 * - 强制 `recordSource` 只能从 DRAFT_AI → AI → MANUAL 单调升级。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { type ProcessingStatus, RecordSource, type RecordSource as RecordSourceValue } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";

export interface UpdateRelationshipInput {
  relationshipTypeCode?: string;
  status?              : ProcessingStatus;
  recordSource?        : RecordSourceValue;
}

export interface UpdateRelationshipResult {
  id                  : string;
  bookId              : string;
  sourceId            : string;
  targetId            : string;
  relationshipTypeCode: string;
  recordSource        : RecordSourceValue;
  status              : ProcessingStatus;
  updatedAt           : string;
}

const RECORD_SOURCE_RANK: Record<RecordSourceValue, number> = {
  [RecordSource.DRAFT_AI]: 0,
  [RecordSource.AI]      : 1,
  [RecordSource.MANUAL]  : 2
};

function assertRecordSourceUpgrade(
  current: RecordSourceValue,
  next: RecordSourceValue
): void {
  if (RECORD_SOURCE_RANK[next] < RECORD_SOURCE_RANK[current]) {
    throw new RelationshipInputError("recordSource 不可降级");
  }
}

export function createUpdateRelationshipService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 更新关系主表字段。关系类型变更必须指向启用中的字典项，避免写入悬空 code。
   */
  async function updateRelationship(
    relationshipId: string,
    input: UpdateRelationshipInput
  ): Promise<UpdateRelationshipResult> {
    if (Object.keys(input).length === 0) {
      throw new RelationshipInputError("至少需要一个可更新字段");
    }

    return prismaClient.$transaction(async (tx) => {
      const current = await tx.relationship.findFirst({
        where: {
          id       : relationshipId,
          deletedAt: null
        },
        select: {
          id          : true,
          recordSource: true
        }
      });
      if (!current) {
        throw new RelationshipNotFoundError(relationshipId);
      }

      const data: {
        relationshipTypeCode?: string;
        status?              : ProcessingStatus;
        recordSource?        : RecordSourceValue;
      } = {};

      if (input.relationshipTypeCode !== undefined) {
        const relationshipTypeCode = input.relationshipTypeCode.trim();
        const relationshipType = await tx.relationshipTypeDefinition.findFirst({
          where : { code: relationshipTypeCode, status: "ACTIVE" },
          select: { code: true }
        });
        if (!relationshipType) {
          throw new RelationshipInputError("关系类型未启用");
        }
        data.relationshipTypeCode = relationshipTypeCode;
      }

      if (input.status !== undefined) {
        data.status = input.status;
      }

      if (input.recordSource !== undefined) {
        assertRecordSourceUpgrade(current.recordSource, input.recordSource);
        data.recordSource = input.recordSource;
      }

      const updated = await tx.relationship.update({
        where : { id: relationshipId },
        data,
        select: {
          id                  : true,
          bookId              : true,
          sourceId            : true,
          targetId            : true,
          relationshipTypeCode: true,
          recordSource        : true,
          status              : true,
          updatedAt           : true
        }
      });

      return {
        id                  : updated.id,
        bookId              : updated.bookId,
        sourceId            : updated.sourceId,
        targetId            : updated.targetId,
        relationshipTypeCode: updated.relationshipTypeCode,
        recordSource        : updated.recordSource,
        status              : updated.status,
        updatedAt           : updated.updatedAt.toISOString()
      };
    });
  }

  return {
    updateRelationship
  };
}

export const { updateRelationship } = createUpdateRelationshipService();
