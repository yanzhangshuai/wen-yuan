import { z } from "zod";

import { ProcessingStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/** 合并建议状态集合（生命周期：待处理 -> 已接受/已拒绝/已暂缓）。 */
const MERGE_SUGGESTION_STATUS_VALUES = [
  "PENDING",
  "ACCEPTED",
  "REJECTED",
  "DEFERRED"
] as const;

/** 合并建议查询条件 Schema。 */
const mergeSuggestionFilterSchema = z.object({
  /** 书籍 ID（UUID）。 */
  bookId: z.string().uuid("书籍 ID 不合法").optional(),
  /** 合并建议状态。 */
  status: z.enum(MERGE_SUGGESTION_STATUS_VALUES).optional()
});

/** 合并建议状态联合类型。 */
type MergeSuggestionStatus = (typeof MERGE_SUGGESTION_STATUS_VALUES)[number];

/** 合并建议查询过滤参数。 */
interface MergeSuggestionFilter {
  /** 可选：限定某一本书。 */
  bookId?: string;
  /** 可选：限定某个处理状态。 */
  status?: MergeSuggestionStatus;
}

/** 管理端合并建议列表项。 */
export interface MergeSuggestionItem {
  /** `MergeSuggestion.id`，建议主键。 */
  id             : string;
  /** 所属书籍 ID。 */
  bookId         : string;
  /** 所属书籍标题。 */
  bookTitle      : string;
  /** 建议被合并的一方（source）人物 ID。 */
  sourcePersonaId: string;
  /** source 人物名称。 */
  sourceName     : string;
  /** 建议保留的一方（target）人物 ID。 */
  targetPersonaId: string;
  /** target 人物名称。 */
  targetName     : string;
  /** 触发建议的解释文本。 */
  reason         : string;
  /** 建议置信度（0~1）。 */
  confidence     : number;
  /** 证据引用（JSON 结构，按生成策略可能为数组或对象）。 */
  evidenceRefs   : unknown;
  /** 建议状态。 */
  status         : MergeSuggestionStatus;
  /** 创建时间（ISO 8601 字符串）。 */
  createdAt      : string;
  /** 处理完成时间（ISO 8601，可空）。 */
  resolvedAt     : string | null;
}

/** 指定合并建议不存在时抛出的异常。 */
export class MergeSuggestionNotFoundError extends Error {
  readonly suggestionId: string;

  constructor(suggestionId: string) {
    super(`Merge suggestion not found: ${suggestionId}`);
    this.suggestionId = suggestionId;
  }
}

/** 合并建议状态不允许当前操作时抛出的异常。 */
export class MergeSuggestionStateError extends Error {
  readonly suggestionId : string;
  readonly currentStatus: string;

  constructor(suggestionId: string, currentStatus: string) {
    super(`Merge suggestion ${suggestionId} cannot be handled because status is ${currentStatus}`);
    this.suggestionId = suggestionId;
    this.currentStatus = currentStatus;
  }
}

/** 执行人物合并时发现冲突（例如人物已删除）时抛出的异常。 */
export class PersonaMergeConflictError extends Error {
  readonly suggestionId: string;

  constructor(suggestionId: string, detail: string) {
    super(detail);
    this.suggestionId = suggestionId;
  }
}

/**
 * 功能：把数据库查询结果映射为 API 层使用的 `MergeSuggestionItem`。
 * 输入：`merge_suggestions` 联表查询行。
 * 输出：标准化后的合并建议对象。
 * 异常：无。
 * 副作用：无。
 */
function mapSuggestionRow(item: {
  id             : string;
  bookId         : string;
  reason         : string;
  confidence     : number;
  evidenceRefs   : unknown;
  status         : string;
  createdAt      : Date;
  resolvedAt     : Date | null;
  book           : { title: string };
  sourcePersona  : { name: string };
  targetPersona  : { name: string };
  sourcePersonaId: string;
  targetPersonaId: string;
}): MergeSuggestionItem {
  return {
    id             : item.id,
    bookId         : item.bookId,
    bookTitle      : item.book.title,
    sourcePersonaId: item.sourcePersonaId,
    sourceName     : item.sourcePersona.name,
    targetPersonaId: item.targetPersonaId,
    targetName     : item.targetPersona.name,
    reason         : item.reason,
    confidence     : item.confidence,
    evidenceRefs   : item.evidenceRefs,
    status         : item.status as MergeSuggestionStatus,
    createdAt      : item.createdAt.toISOString(),
    resolvedAt     : item.resolvedAt?.toISOString() ?? null
  };
}

/**
 * 功能：标准化并去重别名数组。
 * 输入：原始 alias 列表。
 * 输出：trim + 去重 + 去空后的 alias 列表。
 * 异常：无。
 * 副作用：无。
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

export function createMergeSuggestionsService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：按条件查询合并建议列表。
   * 输入：可选 `bookId/status` 过滤参数。
   * 输出：`MergeSuggestionItem[]`（按创建时间倒序）。
   * 异常：过滤参数不合法时抛 ZodError。
   * 副作用：无（只读查询）。
   */
  async function listMergeSuggestions(filter: MergeSuggestionFilter = {}): Promise<MergeSuggestionItem[]> {
    const parsedFilter = mergeSuggestionFilterSchema.parse(filter);

    const suggestions = await prismaClient.mergeSuggestion.findMany({
      where: {
        ...(parsedFilter.bookId ? { bookId: parsedFilter.bookId } : {}),
        ...(parsedFilter.status ? { status: parsedFilter.status } : {})
      },
      orderBy: [{ createdAt: "desc" }],
      select : {
        id             : true,
        bookId         : true,
        sourcePersonaId: true,
        targetPersonaId: true,
        reason         : true,
        confidence     : true,
        evidenceRefs   : true,
        status         : true,
        createdAt      : true,
        resolvedAt     : true,
        book           : {
          select: {
            title: true
          }
        },
        sourcePersona: {
          select: {
            name: true
          }
        },
        targetPersona: {
          select: {
            name: true
          }
        }
      }
    });

    return suggestions.map(mapSuggestionRow);
  }

  /**
   * 功能：接受合并建议并执行实体合并。
   * 输入：`suggestionId` 合并建议主键。
   * 输出：更新后的建议记录（状态 `ACCEPTED`）。
   * 异常：
   * - `MergeSuggestionNotFoundError`：建议不存在；
   * - `MergeSuggestionStateError`：建议非 `PENDING`；
   * - `PersonaMergeConflictError`：source/target 人物冲突（如已删除）。
   * 副作用：
   * - 重定向 biography/mention/relationship 到目标人物；
   * - 去重并更新目标人物 aliases；
   * - 软删除源人物；
   * - 更新建议状态与处理时间。
   */
  async function acceptMergeSuggestion(suggestionId: string): Promise<MergeSuggestionItem> {
    return prismaClient.$transaction(async (tx) => {
      const suggestion = await tx.mergeSuggestion.findUnique({
        where : { id: suggestionId },
        select: {
          id             : true,
          bookId         : true,
          sourcePersonaId: true,
          targetPersonaId: true,
          reason         : true,
          confidence     : true,
          evidenceRefs   : true,
          status         : true,
          createdAt      : true,
          resolvedAt     : true,
          book           : {
            select: {
              title: true
            }
          },
          sourcePersona: {
            select: {
              id       : true,
              name     : true,
              aliases  : true,
              deletedAt: true
            }
          },
          targetPersona: {
            select: {
              id       : true,
              name     : true,
              aliases  : true,
              deletedAt: true
            }
          }
        }
      });

      if (!suggestion) {
        throw new MergeSuggestionNotFoundError(suggestionId);
      }

      if (suggestion.status !== "PENDING") {
        throw new MergeSuggestionStateError(suggestion.id, suggestion.status);
      }

      if (suggestion.sourcePersona.deletedAt || suggestion.targetPersona.deletedAt) {
        throw new PersonaMergeConflictError(suggestion.id, "源人物或目标人物已被删除，无法执行合并");
      }

      const now = new Date();
      const sourcePersonaId = suggestion.sourcePersonaId;
      const targetPersonaId = suggestion.targetPersonaId;

      await tx.biographyRecord.updateMany({
        where: {
          personaId: sourcePersonaId,
          deletedAt: null
        },
        data: {
          personaId: targetPersonaId
        }
      });

      await tx.mention.updateMany({
        where: {
          personaId: sourcePersonaId,
          deletedAt: null
        },
        data: {
          personaId: targetPersonaId
        }
      });

      const affectedRelations = await tx.relationship.findMany({
        where: {
          deletedAt: null,
          OR       : [
            { sourceId: sourcePersonaId },
            { targetId: sourcePersonaId }
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

      for (const relation of affectedRelations) {
        const nextSourceId = relation.sourceId === sourcePersonaId ? targetPersonaId : relation.sourceId;
        const nextTargetId = relation.targetId === sourcePersonaId ? targetPersonaId : relation.targetId;

        if (nextSourceId === nextTargetId) {
          await tx.relationship.update({
            where: { id: relation.id },
            data : {
              status   : ProcessingStatus.REJECTED,
              deletedAt: now
            }
          });
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
          continue;
        }

        if (nextSourceId !== relation.sourceId || nextTargetId !== relation.targetId) {
          await tx.relationship.update({
            where: { id: relation.id },
            data : {
              sourceId: nextSourceId,
              targetId: nextTargetId
            }
          });
        }
      }

      await tx.persona.update({
        where: { id: targetPersonaId },
        data : {
          aliases: normalizeAliases([
            ...suggestion.targetPersona.aliases,
            ...suggestion.sourcePersona.aliases,
            suggestion.sourcePersona.name
          ])
        }
      });

      await tx.persona.update({
        where: { id: sourcePersonaId },
        data : {
          deletedAt: now
        }
      });

      const updatedSuggestion = await tx.mergeSuggestion.update({
        where: { id: suggestion.id },
        data : {
          status    : "ACCEPTED",
          resolvedAt: now
        },
        select: {
          id             : true,
          bookId         : true,
          sourcePersonaId: true,
          targetPersonaId: true,
          reason         : true,
          confidence     : true,
          evidenceRefs   : true,
          status         : true,
          createdAt      : true,
          resolvedAt     : true,
          book           : {
            select: {
              title: true
            }
          },
          sourcePersona: {
            select: {
              name: true
            }
          },
          targetPersona: {
            select: {
              name: true
            }
          }
        }
      });

      return mapSuggestionRow(updatedSuggestion);
    });
  }

  /**
   * 功能：更新合并建议状态（拒绝/暂缓）。
   * 输入：`suggestionId` 与目标状态（REJECTED/DEFERRED）。
   * 输出：更新后的建议记录。
   * 异常：
   * - `MergeSuggestionNotFoundError`；
   * - `MergeSuggestionStateError`（仅允许从 PENDING 转移）。
   * 副作用：写入状态与 `resolvedAt`。
   */
  async function updateSuggestionStatus(
    suggestionId: string,
    status: "REJECTED" | "DEFERRED"
  ): Promise<MergeSuggestionItem> {
    return prismaClient.$transaction(async (tx) => {
      const currentSuggestion = await tx.mergeSuggestion.findUnique({
        where : { id: suggestionId },
        select: {
          id    : true,
          status: true
        }
      });

      if (!currentSuggestion) {
        throw new MergeSuggestionNotFoundError(suggestionId);
      }

      if (currentSuggestion.status !== "PENDING") {
        throw new MergeSuggestionStateError(currentSuggestion.id, currentSuggestion.status);
      }

      const suggestion = await tx.mergeSuggestion.update({
        where: { id: suggestionId },
        data : {
          status,
          resolvedAt: new Date()
        },
        select: {
          id             : true,
          bookId         : true,
          sourcePersonaId: true,
          targetPersonaId: true,
          reason         : true,
          confidence     : true,
          evidenceRefs   : true,
          status         : true,
          createdAt      : true,
          resolvedAt     : true,
          book           : {
            select: {
              title: true
            }
          },
          sourcePersona: {
            select: {
              name: true
            }
          },
          targetPersona: {
            select: {
              name: true
            }
          }
        }
      });

      return mapSuggestionRow(suggestion);
    });
  }

  /**
   * 功能：拒绝合并建议（PENDING -> REJECTED）。
   * 输入：`suggestionId`。
   * 输出：更新后的建议记录。
   * 异常：透传 `updateSuggestionStatus`。
   * 副作用：写入建议状态。
   */
  async function rejectMergeSuggestion(suggestionId: string): Promise<MergeSuggestionItem> {
    return updateSuggestionStatus(suggestionId, "REJECTED");
  }

  /**
   * 功能：暂缓合并建议（PENDING -> DEFERRED）。
   * 输入：`suggestionId`。
   * 输出：更新后的建议记录。
   * 异常：透传 `updateSuggestionStatus`。
   * 副作用：写入建议状态。
   */
  async function deferMergeSuggestion(suggestionId: string): Promise<MergeSuggestionItem> {
    return updateSuggestionStatus(suggestionId, "DEFERRED");
  }

  return {
    listMergeSuggestions,
    acceptMergeSuggestion,
    rejectMergeSuggestion,
    deferMergeSuggestion
  };
}

export const {
  listMergeSuggestions,
  acceptMergeSuggestion,
  rejectMergeSuggestion,
  deferMergeSuggestion
} = createMergeSuggestionsService();

export {
  MERGE_SUGGESTION_STATUS_VALUES,
  type MergeSuggestionStatus
};
