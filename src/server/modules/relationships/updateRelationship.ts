/**
 * =============================================================================
 * 文件定位（服务层：关系更新）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/relationships/updateRelationship.ts`
 *
 * 模块职责：
 * - 对单条关系执行部分字段更新；
 * - 统一处理输入校验、空值语义、业务错误抛出。
 *
 * 业务场景：
 * - 审核人员在复核时修正关系类型、权重、证据与状态；
 * - PATCH 设计可降低全量提交带来的误覆盖风险。
 *
 * 维护约束：
 * - 允许置空字段（description/evidence）是明确业务能力，不能误改成必填；
 * - 至少一项字段更新是防御性规则，避免写入空变更并误导操作结果。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { type ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";

/**
 * 关系更新输入。
 * 字段全部可选，但至少需要传入一个字段。
 */
export interface UpdateRelationshipInput {
  /** 新关系类型。 */
  type?       : string;
  /** 新权重，需为正数。 */
  weight?     : number;
  /** 新关系描述，可置空。 */
  description?: string | null;
  /** 新原文证据，可置空。 */
  evidence?   : string | null;
  /** 新置信度（0~1）。 */
  confidence? : number;
  /** 新审核状态。 */
  status?     : ProcessingStatus;
}

/**
 * 关系更新结果。
 */
export interface UpdateRelationshipResult {
  /** 关系主键 ID。 */
  id         : string;
  /** 所属章节 ID。 */
  chapterId  : string;
  /** 起点人物 ID。 */
  sourceId   : string;
  /** 终点人物 ID。 */
  targetId   : string;
  /** 关系类型。 */
  type       : string;
  /** 权重。 */
  weight     : number;
  /** 关系描述。 */
  description: string | null;
  /** 原文证据。 */
  evidence   : string | null;
  /** 置信度。 */
  confidence : number;
  /** 审核状态。 */
  status     : ProcessingStatus;
  /** 更新时间（ISO 字符串）。 */
  updatedAt  : string;
}

/**
 * 规范化可空文本：`trim` 后空串转 `null`。
 */
function normalizeNullableText(input: string | null): string | null {
  if (input === null) {
    return null;
  }

  const value = input.trim();
  return value.length > 0 ? value : null;
}

export function createUpdateRelationshipService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：更新单条关系记录。
   * 输入：`relationshipId` + `UpdateRelationshipInput`。
   * 输出：更新后关系快照。
   * 异常：
   * - `RelationshipInputError`：未提供任何更新字段；
   * - `RelationshipNotFoundError`：目标关系不存在或已软删除。
   * 副作用：更新 `relationship` 表记录。
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
        select: { id: true }
      });
      if (!current) {
        throw new RelationshipNotFoundError(relationshipId);
      }

      const data: {
        type?       : string;
        weight?     : number;
        description?: string | null;
        evidence?   : string | null;
        confidence? : number;
        status?     : ProcessingStatus;
      } = {};

      if (input.type !== undefined) {
        data.type = input.type.trim();
      }
      if (input.weight !== undefined) {
        data.weight = input.weight;
      }
      if (input.description !== undefined) {
        data.description = normalizeNullableText(input.description);
      }
      if (input.evidence !== undefined) {
        data.evidence = normalizeNullableText(input.evidence);
      }
      if (input.confidence !== undefined) {
        data.confidence = input.confidence;
      }
      if (input.status !== undefined) {
        data.status = input.status;
      }

      const updated = await tx.relationship.update({
        where : { id: relationshipId },
        data,
        select: {
          id         : true,
          chapterId  : true,
          sourceId   : true,
          targetId   : true,
          type       : true,
          weight     : true,
          description: true,
          evidence   : true,
          confidence : true,
          status     : true,
          updatedAt  : true
        }
      });

      return {
        id         : updated.id,
        chapterId  : updated.chapterId,
        sourceId   : updated.sourceId,
        targetId   : updated.targetId,
        type       : updated.type,
        weight     : updated.weight,
        description: updated.description,
        evidence   : updated.evidence,
        confidence : updated.confidence,
        status     : updated.status,
        updatedAt  : updated.updatedAt.toISOString()
      };
    });
  }

  return {
    updateRelationship
  };
}

export const { updateRelationship } = createUpdateRelationshipService();
