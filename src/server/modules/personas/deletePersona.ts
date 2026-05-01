/**
 * =============================================================================
 * 文件定位（服务层：人物软删除）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/personas/deletePersona.ts`
 *
 * 模块职责：
 * - 执行人物软删除，并级联处理关联关系/传记/提及/书内档案；
 * - 返回级联影响统计，供前端提示“本次删除影响范围”。
 *
 * 设计原因：
 * - 使用软删除而非硬删除，是为了保留审计与回溯能力；
 * - 级联 REJECTED 状态可避免下游角色资料工作台继续展示无效数据。
 *
 * 约束：
 * - 级联规则属于业务一致性规则，不可随意简化，否则会出现“孤儿关系/传记”。
 * =============================================================================
 */
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

export interface DeletePersonaPreview {
  persona: {
    id  : string;
    name: string;
  };
  counts: {
    relationshipCount: number;
    biographyCount   : number;
    mentionCount     : number;
    profileCount     : number;
  };
  biographies: Array<{
    id     : string;
    title  : string | null;
    event  : string;
    chapter: string;
  }>;
  relationships: Array<{
    id         : string;
    type       : string;
    sourceName : string;
    targetName : string;
    description: string | null;
    chapter    : string;
  }>;
  mentions: Array<{
    id     : string;
    rawText: string;
    summary: string | null;
    chapter: string;
  }>;
  profiles: Array<{
    id       : string;
    bookId   : string;
    localName: string;
  }>;
}

interface PreviewOptions {
  bookId?: string;
}

function chapterLabel(chapter: { no?: number | null; title?: string | null } | null | undefined): string {
  if (!chapter) return "未知章节";
  const no = typeof chapter.no === "number" ? `第${chapter.no}回` : "";
  return [no, chapter.title ?? ""].filter(Boolean).join(" ") || "未知章节";
}

function scopedCascadeWhere(personaId: string, options: PreviewOptions = {}) {
  const chapterBookScope = options.bookId ? { chapter: { bookId: options.bookId } } : {};
  return {
    relationships: {
      deletedAt: null,
      OR       : [
        { sourceId: personaId },
        { targetId: personaId }
      ],
      ...(options.bookId ? { bookId: options.bookId } : {})
    },
    biographies: {
      personaId,
      deletedAt: null,
      ...chapterBookScope
    },
    mentions: {
      personaId,
      deletedAt: null,
      ...chapterBookScope
    },
    profiles: {
      personaId,
      deletedAt: null,
      ...(options.bookId ? { bookId: options.bookId } : {})
    }
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
  async function previewDeletePersona(
    personaId: string,
    options: PreviewOptions = {}
  ): Promise<DeletePersonaPreview> {
    const existing = await prismaClient.persona.findFirst({
      where: {
        id       : personaId,
        deletedAt: null
      },
      select: {
        id  : true,
        name: true
      }
    });
    if (!existing) {
      throw new PersonaNotFoundError(personaId);
    }

    const where = scopedCascadeWhere(personaId, options);
    const [relationships, biographies, mentions, profiles] = await Promise.all([
      prismaClient.relationship.findMany({
        where  : where.relationships,
        orderBy: [{ updatedAt: "desc" }],
        select : {
          id                  : true,
          relationshipTypeCode: true,
          source              : { select: { name: true } },
          target              : { select: { name: true } },
          events              : {
            where  : { deletedAt: null },
            orderBy: [{ chapterNo: "asc" }],
            take   : 1,
            select : {
              summary: true,
              chapter: { select: { no: true, title: true } }
            }
          }
        }
      }),
      prismaClient.biographyRecord.findMany({
        where  : where.biographies,
        orderBy: [{ chapterNo: "asc" }, { updatedAt: "desc" }],
        select : {
          id       : true,
          title    : true,
          event    : true,
          chapterNo: true,
          chapter  : { select: { title: true } }
        }
      }),
      prismaClient.mention.findMany({
        where  : where.mentions,
        orderBy: [{ updatedAt: "desc" }],
        select : {
          id     : true,
          rawText: true,
          summary: true,
          chapter: { select: { no: true, title: true } }
        }
      }),
      prismaClient.profile.findMany({
        where  : where.profiles,
        orderBy: [{ updatedAt: "desc" }],
        select : {
          id       : true,
          bookId   : true,
          localName: true
        }
      })
    ]);

    return {
      persona: existing,
      counts : {
        relationshipCount: relationships.length,
        biographyCount   : biographies.length,
        mentionCount     : mentions.length,
        profileCount     : profiles.length
      },
      biographies: biographies.map(item => ({
        id     : item.id,
        title  : item.title,
        event  : item.event,
        chapter: chapterLabel({ no: item.chapterNo, title: item.chapter?.title })
      })),
      relationships: relationships.map(item => ({
        id         : item.id,
        type       : item.relationshipTypeCode,
        sourceName : item.source.name,
        targetName : item.target.name,
        description: item.events[0]?.summary ?? null,
        chapter    : chapterLabel(item.events[0]?.chapter)
      })),
      mentions: mentions.map(item => ({
        id     : item.id,
        rawText: item.rawText,
        summary: item.summary,
        chapter: chapterLabel(item.chapter)
      })),
      profiles: profiles.map(item => ({
        id       : item.id,
        bookId   : item.bookId,
        localName: item.localName
      }))
    };
  }

  async function deletePersona(
    personaId: string,
    options: PreviewOptions = {}
  ): Promise<DeletePersonaResult> {
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
      const where = scopedCascadeWhere(personaId, options);
      const [relationshipResult, biographyResult, mentionResult, profileResult] = await Promise.all([
        tx.relationship.updateMany({
          where: where.relationships,
          data : {
            status   : ProcessingStatus.REJECTED,
            deletedAt: now
          }
        }),
        tx.biographyRecord.updateMany({
          where: where.biographies,
          data : {
            status   : ProcessingStatus.REJECTED,
            deletedAt: now
          }
        }),
        tx.mention.updateMany({
          where: where.mentions,
          data : {
            deletedAt: now
          }
        }),
        tx.profile.updateMany({
          where: where.profiles,
          data : {
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

  return { deletePersona, previewDeletePersona };
}

export const { deletePersona, previewDeletePersona } = createDeletePersonaService();
