/**
 * =============================================================================
 * 文件定位（服务层：人物拆分）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/personas/splitPersona.ts`
 *
 * 模块职责：
 * - 把“同一 persona 下混入的另一人物”按章节切分到新 persona；
 * - 在同一事务中迁移 mention / 传记 / 关系，避免半成功状态；
 * - 对关系重写时处理自环与去重冲突，保证图谱边结构稳定。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * 人物拆分输入。
 */
export interface SplitPersonaInput {
  /** 原人物 ID（被拆出的来源）。 */
  sourceId   : string;
  /** 章节所属书籍 ID。 */
  bookId     : string;
  /** 需要迁移的章节号列表。 */
  chapterNos : number[];
  /** 新人物标准名。 */
  name       : string;
  /** 新人物别名。 */
  aliases?   : string[];
  /** 新人物性别（不传则继承来源人物）。 */
  gender?    : string | null;
  /** 新人物籍贯（不传则继承来源人物）。 */
  hometown?  : string | null;
  /** 新人物全局标签（不传则继承来源人物）。 */
  globalTags?: string[];
  /** 新人物置信度（不传则继承来源人物）。 */
  confidence?: number;
  /** 新人物在本书展示名（不传则使用 name）。 */
  localName? : string;
}

/**
 * 人物拆分结果统计。
 */
export interface SplitPersonaResult {
  /** 来源人物 ID。 */
  sourceId                : string;
  /** 新建人物 ID。 */
  createdPersonaId        : string;
  /** 所属书籍 ID。 */
  bookId                  : string;
  /** 实际参与迁移的章节号。 */
  chapterNos              : number[];
  /** 被重写的关系数量。 */
  redirectedRelationships : number;
  /** 因冲突被拒绝的关系数量。 */
  rejectedRelationships   : number;
  /** 被迁移的传记事件数量。 */
  redirectedBiographyCount: number;
  /** 被迁移的 mention 数量。 */
  redirectedMentionCount  : number;
}

/**
 * 拆分输入不合法错误。
 */
export class PersonaSplitInputError extends Error {
  /**
   * @param message 可直接透传给前端的人类可读错误信息。
   */
  constructor(message: string) {
    super(message);
  }
}

function normalizeDistinctItems(items: string[] | undefined): string[] {
  if (!items) {
    return [];
  }

  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const normalized = item.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

function normalizeChapterNos(chapterNos: number[]): number[] {
  const distinct = new Set<number>();
  for (const no of chapterNos) {
    if (Number.isInteger(no) && no > 0) {
      distinct.add(no);
    }
  }
  return [...distinct].sort((a, b) => a - b);
}

export function createSplitPersonaService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：按章节把 source persona 的局部数据拆分到新 persona。
   * 输入：sourceId/bookId/chapterNos/new persona 基础信息。
   * 输出：拆分统计结果。
   * 异常：
   * - `PersonaSplitInputError`：输入不合法或章节不存在；
   * - `PersonaNotFoundError`：来源人物不存在。
   * 副作用：
   * - 新建 persona + profile；
   * - 迁移 chapter scoped mention/传记；
   * - 重写关系并处理冲突。
   */
  async function splitPersona(input: SplitPersonaInput): Promise<SplitPersonaResult> {
    const chapterNos = normalizeChapterNos(input.chapterNos);
    if (chapterNos.length === 0) {
      throw new PersonaSplitInputError("至少选择一个有效章节");
    }

    const normalizedName = input.name.trim();
    if (!normalizedName) {
      throw new PersonaSplitInputError("新人物名称不能为空");
    }

    return prismaClient.$transaction(async (tx) => {
      const sourcePersona = await tx.persona.findFirst({
        where: {
          id       : input.sourceId,
          deletedAt: null
        },
        select: {
          id        : true,
          type      : true,
          nameType  : true,
          gender    : true,
          hometown  : true,
          globalTags: true,
          confidence: true
        }
      });
      if (!sourcePersona) {
        throw new PersonaNotFoundError(input.sourceId);
      }

      const chapters = await tx.chapter.findMany({
        where: {
          bookId: input.bookId,
          no    : { in: chapterNos }
        },
        select: {
          id: true,
          no: true
        }
      });
      if (chapters.length !== chapterNos.length) {
        throw new PersonaSplitInputError("存在不属于当前书籍的章节，无法拆分");
      }
      const chapterIds = chapters.map((item) => item.id);

      const createdPersona = await tx.persona.create({
        data: {
          name        : normalizedName,
          type        : sourcePersona.type,
          nameType    : sourcePersona.nameType,
          aliases     : normalizeDistinctItems([normalizedName, ...(input.aliases ?? [])]),
          gender      : input.gender === undefined ? sourcePersona.gender : normalizeNullableText(input.gender),
          hometown    : input.hometown === undefined ? sourcePersona.hometown : normalizeNullableText(input.hometown),
          globalTags  : input.globalTags ? normalizeDistinctItems(input.globalTags) : sourcePersona.globalTags,
          confidence  : input.confidence ?? sourcePersona.confidence,
          recordSource: RecordSource.MANUAL
        },
        select: { id: true }
      });

      await tx.profile.create({
        data: {
          personaId : createdPersona.id,
          bookId    : input.bookId,
          localName : input.localName?.trim() || normalizedName,
          localTags : [],
          ironyIndex: 0
        }
      });

      const biographyUpdated = await tx.biographyRecord.updateMany({
        where: {
          personaId: sourcePersona.id,
          chapterId: { in: chapterIds },
          deletedAt: null
        },
        data: { personaId: createdPersona.id }
      });
      const mentionUpdated = await tx.mention.updateMany({
        where: {
          personaId: sourcePersona.id,
          chapterId: { in: chapterIds },
          deletedAt: null
        },
        data: { personaId: createdPersona.id }
      });

      const relations = await tx.relationship.findMany({
        where: {
          chapterId: { in: chapterIds },
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
      const now = new Date();

      for (const relation of relations) {
        const nextSourceId = relation.sourceId === sourcePersona.id ? createdPersona.id : relation.sourceId;
        const nextTargetId = relation.targetId === sourcePersona.id ? createdPersona.id : relation.targetId;

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

        await tx.relationship.update({
          where: { id: relation.id },
          data : {
            sourceId: nextSourceId,
            targetId: nextTargetId
          }
        });
        redirectedRelationships += 1;
      }

      return {
        sourceId                : sourcePersona.id,
        createdPersonaId        : createdPersona.id,
        bookId                  : input.bookId,
        chapterNos              : chapterNos,
        redirectedRelationships,
        rejectedRelationships,
        redirectedBiographyCount: biographyUpdated.count,
        redirectedMentionCount  : mentionUpdated.count
      };
    });
  }

  return { splitPersona };
}

export const { splitPersona } = createSplitPersonaService();
export { PersonaNotFoundError };
