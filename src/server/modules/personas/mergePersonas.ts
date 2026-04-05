/**
 * =============================================================================
 * 文件定位（服务层：人物合并）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/personas/mergePersonas.ts`
 *
 * 模块职责：
 * - 将重复人物（source）并入目标人物（target）；
 * - 处理关系、传记、mention 等多表归属重定向与冲突兜底；
 * - 产出可审计的统计结果，供接口层回传前端。
 *
 * 业务背景：
 * - AI 抽取与人工录入并存时，重复建档不可避免；
 * - 合并规则是图谱质量关键规则，不是技术细节。
 *
 * 风险提示（通过注释给维护者）：
 * - 该模块涉及多实体事务与冲突策略，改动前需验证“无自环、无重复边、无孤儿引用”。
 * =============================================================================
 */
import { ProcessingStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * 人物合并输入。
 */
export interface MergePersonasInput {
  /** 目标人物 ID（保留）。 */
  targetId: string;
  /** 源人物 ID（被合并并软删）。 */
  sourceId: string;
}

/**
 * 人物合并结果统计。
 */
export interface MergePersonasResult {
  /** 源人物 ID。 */
  sourceId                : string;
  /** 目标人物 ID。 */
  targetId                : string;
  /** 被重定向的关系数量。 */
  redirectedRelationships : number;
  /** 因冲突被拒绝的关系数量。 */
  rejectedRelationships   : number;
  /** 被重定向的传记事件数量。 */
  redirectedBiographyCount: number;
  /** 被重定向的 mention 数量。 */
  redirectedMentionCount  : number;
}

/**
 * 合并输入不合法错误（例如 source 与 target 相同）。
 */
export class PersonaMergeInputError extends Error {
  /**
   * @param message 业务可读错误信息。
   */
  constructor(message: string) {
    super(message);
  }
}

/**
 * 去重并标准化别名。
 */
function normalizeAliases(input: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of input) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }

    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

export function createMergePersonasService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：将源人物并入目标人物。
   * 输入：目标人物 ID + 源人物 ID。
   * 输出：合并统计结果。
   * 异常：
   * - `PersonaMergeInputError`：输入不合法；
   * - `PersonaNotFoundError`：源/目标人物不存在。
   * 副作用：
   * - 重定向传记与提及；
   * - 重写或拒绝冲突关系；
   * - 合并别名；
   * - 软删除源人物。
   */
  async function mergePersonas(input: MergePersonasInput): Promise<MergePersonasResult> {
    if (input.sourceId === input.targetId) {
      throw new PersonaMergeInputError("源人物与目标人物不能相同");
    }

    return prismaClient.$transaction(async (tx) => {
      const personas = await tx.persona.findMany({
        where: {
          id       : { in: [input.sourceId, input.targetId] },
          deletedAt: null
        },
        select: {
          id     : true,
          name   : true,
          aliases: true
        }
      });

      const sourcePersona = personas.find((item) => item.id === input.sourceId);
      if (!sourcePersona) {
        throw new PersonaNotFoundError(input.sourceId);
      }

      const targetPersona = personas.find((item) => item.id === input.targetId);
      if (!targetPersona) {
        throw new PersonaNotFoundError(input.targetId);
      }

      const now = new Date();
      const biographyUpdated = await tx.biographyRecord.updateMany({
        where: {
          personaId: sourcePersona.id,
          deletedAt: null
        },
        data: {
          personaId: targetPersona.id
        }
      });
      const mentionUpdated = await tx.mention.updateMany({
        where: {
          personaId: sourcePersona.id,
          deletedAt: null
        },
        data: {
          personaId: targetPersona.id
        }
      });

      const relations = await tx.relationship.findMany({
        where: {
          deletedAt: null,
          OR       : [
            { sourceId: sourcePersona.id },
            { targetId: sourcePersona.id }
          ]
        },
        select: {
          id          : true,
          chapterId   : true,
          sourceId    : true,
          targetId    : true,
          type        : true,
          recordSource: true
        }
      });

      let redirectedRelationships = 0;
      let rejectedRelationships = 0;

      for (const relation of relations) {
        const nextSourceId = relation.sourceId === sourcePersona.id ? targetPersona.id : relation.sourceId;
        const nextTargetId = relation.targetId === sourcePersona.id ? targetPersona.id : relation.targetId;

        if (nextSourceId === nextTargetId) {
          await tx.relationship.update({
            where: { id: relation.id },
            data : {
              status   : ProcessingStatus.REJECTED,
              deletedAt: now
            }
          });
          rejectedRelationships += 1;
          continue;
        }

        const duplicated = await tx.relationship.findFirst({
          where: {
            id          : { not: relation.id },
            deletedAt   : null,
            chapterId   : relation.chapterId,
            sourceId    : nextSourceId,
            targetId    : nextTargetId,
            type        : relation.type,
            recordSource: relation.recordSource
          },
          select: { id: true }
        });

        if (duplicated) {
          await tx.relationship.update({
            where: { id: relation.id },
            data : {
              status   : ProcessingStatus.REJECTED,
              deletedAt: now
            }
          });
          rejectedRelationships += 1;
          continue;
        }

        if (relation.sourceId !== nextSourceId || relation.targetId !== nextTargetId) {
          await tx.relationship.update({
            where: { id: relation.id },
            data : {
              sourceId: nextSourceId,
              targetId: nextTargetId
            }
          });
          redirectedRelationships += 1;
        }
      }

      await tx.persona.update({
        where: { id: targetPersona.id },
        data : {
          aliases: normalizeAliases([
            ...targetPersona.aliases,
            ...sourcePersona.aliases,
            sourcePersona.name
          ])
        }
      });
      await tx.persona.update({
        where: { id: sourcePersona.id },
        data : {
          deletedAt: now
        }
      });

      return {
        sourceId                : sourcePersona.id,
        targetId                : targetPersona.id,
        redirectedRelationships,
        rejectedRelationships,
        redirectedBiographyCount: biographyUpdated.count,
        redirectedMentionCount  : mentionUpdated.count
      };
    });
  }

  return { mergePersonas };
}

export const { mergePersonas } = createMergePersonasService();
export { PersonaNotFoundError };
