import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * 人物软删除结果。
 */
export interface DeletePersonaResult {
  /** 人物 ID。 */
  id       : string;
  /** 人物软删除时间。 */
  deletedAt: string;
  /** 级联影响统计。 */
  cascaded : {
    /** 被拒绝并软删的关系数。 */
    relationshipCount: number;
    /** 被拒绝并软删的传记事件数。 */
    biographyCount   : number;
    /** 被软删的提及记录数。 */
    mentionCount     : number;
    /** 被软删的书内档案数。 */
    profileCount     : number;
  };
}

export function createDeletePersonaService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：软删除人物并级联处理关联数据。
   * 输入：`personaId`。
   * 输出：删除结果与级联统计。
   * 异常：人物不存在时抛出 `PersonaNotFoundError`。
   * 副作用：
   * - 人物软删除；
   * - 关联关系/传记置 `REJECTED` 并软删除；
   * - mention/profile 软删除。
   */
  async function deletePersona(personaId: string): Promise<DeletePersonaResult> {
    return prismaClient.$transaction(async (tx) => {
      const existing = await tx.persona.findFirst({
        where: {
          id       : personaId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!existing) {
        throw new PersonaNotFoundError(personaId);
      }

      const now = new Date();
      const [relationshipResult, biographyResult, mentionResult, profileResult] = await Promise.all([
        tx.relationship.updateMany({
          where: {
            deletedAt: null,
            OR       : [
              { sourceId: personaId },
              { targetId: personaId }
            ]
          },
          data: {
            status   : ProcessingStatus.REJECTED,
            deletedAt: now
          }
        }),
        tx.biographyRecord.updateMany({
          where: {
            personaId,
            deletedAt: null
          },
          data: {
            status   : ProcessingStatus.REJECTED,
            deletedAt: now
          }
        }),
        tx.mention.updateMany({
          where: {
            personaId,
            deletedAt: null
          },
          data: {
            deletedAt: now
          }
        }),
        tx.profile.updateMany({
          where: {
            personaId,
            deletedAt: null
          },
          data: {
            deletedAt: now
          }
        })
      ]);

      await tx.persona.update({
        where: { id: personaId },
        data : {
          deletedAt: now
        },
        select: { id: true }
      });

      return {
        id       : personaId,
        deletedAt: now.toISOString(),
        cascaded : {
          relationshipCount: relationshipResult.count,
          biographyCount   : biographyResult.count,
          mentionCount     : mentionResult.count,
          profileCount     : profileResult.count
        }
      };
    });
  }

  return { deletePersona };
}

export const { deletePersona } = createDeletePersonaService();
