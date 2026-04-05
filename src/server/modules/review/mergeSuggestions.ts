import { z } from "zod";

import { ProcessingStatus } from "@/generated/prisma/enums";
import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * =============================================================================
 * 文件定位（服务端领域模块：合并建议查询与处理）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/review/mergeSuggestions.ts`
 *
 * 在 Next.js 项目中的角色：
 * - 属于服务端“审核域”核心模块，负责合并建议（merge suggestion）生命周期管理；
 * - 被 `app/api/admin/merge-suggestions` 目录下各级 `route.ts` 路由处理器调用；
 * - 不直接暴露 HTTP 语义，只提供可复用的纯业务能力。
 *
 * 分层职责：
 * 1) 读：按 bookId/status 查询建议列表；
 * 2) 写：接受建议并执行实体合并，或将建议标记为拒绝/暂缓；
 * 3) 异常：抛出领域错误给路由层映射为 404/409 等响应。
 *
 * 关键业务规则（请勿随意更改）：
 * - 合并建议状态机只允许 `PENDING -> ACCEPTED/REJECTED/DEFERRED`；
 * - 只有 `PENDING` 才能被处理；
 * - 接受合并时会迁移传记、提及、关系，并软删除源人物；
 * - 关系重写后若形成“自环”或“重复边”，会把旧边标记为 REJECTED 并软删除。
 *   这是业务规则，不是技术限制。
 *
 * 维护注意：
 * - `acceptMergeSuggestion` 内部是事务，任一步失败都会回滚，保障数据一致性；
 * - 前端“合并预览”只是提示，最终数据以本模块事务结果为准。
 * =============================================================================
 */

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
  /** 未找到的建议 ID，方便路由层拼接日志与错误上下文。 */
  readonly suggestionId: string;

  constructor(suggestionId: string) {
    super(`Merge suggestion not found: ${suggestionId}`);
    this.suggestionId = suggestionId;
  }
}

/** 合并建议状态不允许当前操作时抛出的异常。 */
export class MergeSuggestionStateError extends Error {
  /** 冲突建议 ID。 */
  readonly suggestionId : string;
  /** 当前真实状态（用于提示“为什么不能处理”）。 */
  readonly currentStatus: string;

  constructor(suggestionId: string, currentStatus: string) {
    super(`Merge suggestion ${suggestionId} cannot be handled because status is ${currentStatus}`);
    this.suggestionId = suggestionId;
    this.currentStatus = currentStatus;
  }
}

/** 执行人物合并时发现冲突（例如人物已删除）时抛出的异常。 */
export class PersonaMergeConflictError extends Error {
  /** 冲突对应的建议 ID。 */
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
 *
 * 设计原因：
 * - 统一把 Date 转成 ISO 字符串，避免不同调用方重复做序列化；
 * - 统一输出字段命名，降低路由层与前端耦合成本。
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
 *
 * 设计原因：
 * - 合并后别名来源多，必须去重避免冗余污染；
 * - 去空值是防御措施，避免脏字符串进入人物主档。
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
    // 参数校验放在服务层，确保页面直调与 API 调用规则一致。
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
   *
   * 异常：
   * - `MergeSuggestionNotFoundError`：建议不存在；
   * - `MergeSuggestionStateError`：建议非 `PENDING`；
   * - `PersonaMergeConflictError`：source/target 人物冲突（如已删除）。
   *
   * 副作用（全部在同一事务内）：
   * 1) 把 source 人物关联的 biographyRecord 改绑到 target；
   * 2) 把 source 人物关联的 mention 改绑到 target；
   * 3) 重写关系边（处理自环和重复边）；
   * 4) 合并 target aliases；
   * 5) 软删除 source 人物；
   * 6) 建议状态改为 ACCEPTED 并写 resolvedAt。
   */
  async function acceptMergeSuggestion(suggestionId: string): Promise<MergeSuggestionItem> {
    return prismaClient.$transaction(async (tx) => {
      // 第一步：读取建议与 source/target 最小必要信息，校验可处理性。
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

      // 仅允许从 PENDING 进入 ACCEPTED，这是审核流程状态机业务规则。
      if (suggestion.status !== "PENDING") {
        throw new MergeSuggestionStateError(suggestion.id, suggestion.status);
      }

      // 防御并发场景：若人物已被删除，本次合并必须终止。
      if (suggestion.sourcePersona.deletedAt || suggestion.targetPersona.deletedAt) {
        throw new PersonaMergeConflictError(suggestion.id, "源人物或目标人物已被删除，无法执行合并");
      }

      const now = new Date();
      const sourcePersonaId = suggestion.sourcePersonaId;
      const targetPersonaId = suggestion.targetPersonaId;

      // 第二步：先迁移“单向归属型数据”，把 source 归并到 target。
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

      // 第三步：处理关系边迁移。
      // 关系比 biography/mention 更复杂，因为替换 sourceId/targetId 后可能出现：
      // 1) 自环边（source===target）；
      // 2) 重复边（同 chapter/source/target/type/source 重复）。
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

        // 分支 A：替换后形成自环边，按业务规则直接作废（REJECTED + 软删除）。
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

        // 分支 B：替换后与现存边重复，也作废当前边，避免图数据重复。
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

        // 分支 C：合法迁移，更新 sourceId/targetId。
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

      // 第四步：把 source 的名字与别名并入 target，构建统一人物画像。
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

      // 第五步：软删除 source 人物。
      // 说明：软删除而不是硬删除，是为了保留审计与追溯能力。
      await tx.persona.update({
        where: { id: sourcePersonaId },
        data : {
          deletedAt: now
        }
      });

      // 第六步：回写建议状态，标记本次建议已处理完成。
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
   *
   * 业务语义：
   * - `REJECTED`：明确判定该建议不成立；
   * - `DEFERRED`：暂不处理，后续可再审。
   *
   * 异常：
   * - `MergeSuggestionNotFoundError`；
   * - `MergeSuggestionStateError`（仅允许从 PENDING 转移）。
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

/** 默认导出实例：生产代码直接复用；测试中可通过工厂注入 mock PrismaClient。 */
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
