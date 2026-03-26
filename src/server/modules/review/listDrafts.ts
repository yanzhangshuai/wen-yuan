import { z } from "zod";

import type { PrismaClient } from "@/generated/prisma/client";
import type { NameType } from "@/generated/prisma/enums";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";

/** 审核草稿页可选的 Tab 值（人物 / 关系 / 传记事件）。 */
export const REVIEW_DRAFT_TAB_VALUES = ["PERSONA", "RELATIONSHIP", "BIOGRAPHY"] as const;

/** 管理端草稿列表筛选条件 Schema（查询参数/函数入参统一复用）。 */
const listDraftsFilterSchema = z.object({
  /** 书籍主键 UUID。 */
  bookId: z.string().uuid("书籍 ID 不合法").optional(),
  /** 草稿类型 Tab。 */
  tab   : z.enum(REVIEW_DRAFT_TAB_VALUES).optional(),
  /** 数据来源：AI 或 MANUAL。 */
  source: z.nativeEnum(RecordSource).optional()
});

/** 草稿 Tab 联合类型。 */
export type ReviewDraftTab = (typeof REVIEW_DRAFT_TAB_VALUES)[number];

/** 查询管理员草稿列表的筛选参数。 */
export interface ListDraftsFilter {
  /** 书籍 ID（可选）；为空时查询全部书籍。 */
  bookId?: string;
  /** 草稿类型（可选）；为空时返回全部类型。 */
  tab?   : ReviewDraftTab;
  /** 来源过滤（可选）；为空时不过滤来源。 */
  source?: RecordSource;
}

/** 人物草稿行（来源 `Profile + Persona` 联合映射）。 */
export interface PersonaDraftItem {
  /** `Profile.id`，草稿项主键。 */
  id          : string;
  /** 所属书籍 ID（UUID）。 */
  bookId      : string;
  /** 所属书名。 */
  bookTitle   : string;
  /** `Persona.id`，人物主键。 */
  personaId   : string;
  /** 人物标准名。 */
  name        : string;
  /** 人物别名数组。 */
  aliases     : string[];
  /** 姓名类型：`NAMED` 或 `TITLE_ONLY`。 */
  nameType    : NameType;
  /** 记录来源：AI 或 MANUAL。 */
  recordSource: RecordSource;
  /** AI 置信度（0~1）。 */
  confidence  : number;
  /** 籍贯（可空）。 */
  hometown    : string | null;
  /** 草稿状态固定为 `DRAFT`。 */
  status      : typeof ProcessingStatus.DRAFT;
}

/** 关系草稿行（来源 `Relationship`）。 */
export interface RelationshipDraftItem {
  /** `Relationship.id`，关系主键。 */
  id             : string;
  /** 所属书籍 ID。 */
  bookId         : string;
  /** 所属书名。 */
  bookTitle      : string;
  /** 首次出现章节 ID。 */
  chapterId      : string;
  /** 首次出现章节序号（从 1 开始）。 */
  chapterNo      : number;
  /** 起点人物 ID。 */
  sourcePersonaId: string;
  /** 起点人物名称。 */
  sourceName     : string;
  /** 终点人物 ID。 */
  targetPersonaId: string;
  /** 终点人物名称。 */
  targetName     : string;
  /** 关系类型（如师生/亲属/同僚）。 */
  type           : string;
  /** 关系权重。 */
  weight         : number;
  /** AI 置信度（0~1）。 */
  confidence     : number;
  /** 原文证据片段（可空）。 */
  evidence       : string | null;
  /** 记录来源：AI 或 MANUAL。 */
  recordSource   : RecordSource;
  /** 草稿状态固定为 `DRAFT`。 */
  status         : typeof ProcessingStatus.DRAFT;
}

/** 传记事件草稿行（来源 `BiographyRecord`）。 */
export interface BiographyDraftItem {
  /** `BiographyRecord.id`，事件主键。 */
  id          : string;
  /** 所属书籍 ID。 */
  bookId      : string;
  /** 所属书名。 */
  bookTitle   : string;
  /** 所属章节 ID。 */
  chapterId   : string;
  /** 所属章节序号。 */
  chapterNo   : number;
  /** 关联人物 ID。 */
  personaId   : string;
  /** 关联人物名称。 */
  personaName : string;
  /** 事件类别（`BioCategory`）。 */
  category    : string;
  /** 事件标题（可空）。 */
  title       : string | null;
  /** 事件地点（可空）。 */
  location    : string | null;
  /** 事件正文。 */
  event       : string;
  /** 数据来源：AI 或 MANUAL。 */
  recordSource: RecordSource;
  /** 草稿状态固定为 `DRAFT`。 */
  status      : typeof ProcessingStatus.DRAFT;
}

/** 管理端草稿看板响应体。 */
export interface AdminDraftsResult {
  /** 各维度草稿数量汇总。 */
  summary: {
    /** 人物草稿总数。 */
    persona     : number;
    /** 关系草稿总数。 */
    relationship: number;
    /** 传记事件草稿总数。 */
    biography   : number;
    /** 草稿总数（上面三项相加）。 */
    total       : number;
  };
  /** 人物草稿列表。 */
  personas        : PersonaDraftItem[];
  /** 关系草稿列表。 */
  relationships   : RelationshipDraftItem[];
  /** 传记事件草稿列表。 */
  biographyRecords: BiographyDraftItem[];
}

/**
 * 功能：构造人物草稿查询条件。
 * 输入：`parsed filter`（经 Zod 校验后的筛选参数）。
 * 输出：Prisma `ProfileWhereInput` 兼容对象。
 * 异常：无。
 * 副作用：无。
 */
function buildPersonaWhere(filter: z.infer<typeof listDraftsFilterSchema>) {
  return {
    deletedAt: null,
    ...(filter.bookId ? { bookId: filter.bookId } : {}),
    book     : {
      deletedAt: null
    },
    persona: {
      deletedAt: null,
      ...(filter.source ? { recordSource: filter.source } : {})
    }
  };
}

/**
 * 功能：构造关系草稿查询条件。
 * 输入：`parsed filter`（经 Zod 校验后的筛选参数）。
 * 输出：Prisma `RelationshipWhereInput` 兼容对象。
 * 异常：无。
 * 副作用：无。
 */
function buildRelationshipWhere(filter: z.infer<typeof listDraftsFilterSchema>) {
  return {
    status   : ProcessingStatus.DRAFT,
    deletedAt: null,
    ...(filter.bookId ? { chapter: { bookId: filter.bookId, book: { deletedAt: null } } } : { chapter: { book: { deletedAt: null } } }),
    ...(filter.source ? { recordSource: filter.source } : {})
  };
}

/**
 * 功能：构造传记事件草稿查询条件。
 * 输入：`parsed filter`（经 Zod 校验后的筛选参数）。
 * 输出：Prisma `BiographyRecordWhereInput` 兼容对象。
 * 异常：无。
 * 副作用：无。
 */
function buildBiographyWhere(filter: z.infer<typeof listDraftsFilterSchema>) {
  return {
    status   : ProcessingStatus.DRAFT,
    deletedAt: null,
    ...(filter.bookId ? { chapter: { bookId: filter.bookId, book: { deletedAt: null } } } : { chapter: { book: { deletedAt: null } } }),
    ...(filter.source ? { recordSource: filter.source } : {})
  };
}

export function createListDraftsService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：查询管理员审核看板草稿数据（含 summary + 各 Tab 列表）。
   * 输入：`filter`（可选：bookId/tab/source）。
   * 输出：`AdminDraftsResult`。
   * 异常：筛选参数不合法时抛出 ZodError。
   * 副作用：无（只读查询）。
   */
  async function listAdminDrafts(filter: ListDraftsFilter = {}): Promise<AdminDraftsResult> {
    const parsedFilter = listDraftsFilterSchema.parse(filter);
    const personaWhere = buildPersonaWhere(parsedFilter);
    const relationshipWhere = buildRelationshipWhere(parsedFilter);
    const biographyWhere = buildBiographyWhere(parsedFilter);

    const [personaCount, relationshipCount, biographyCount] = await Promise.all([
      prismaClient.profile.count({ where: personaWhere }),
      prismaClient.relationship.count({ where: relationshipWhere }),
      prismaClient.biographyRecord.count({ where: biographyWhere })
    ]);

    const shouldListPersonas = !parsedFilter.tab || parsedFilter.tab === "PERSONA";
    const shouldListRelationships = !parsedFilter.tab || parsedFilter.tab === "RELATIONSHIP";
    const shouldListBiography = !parsedFilter.tab || parsedFilter.tab === "BIOGRAPHY";

    const [personas, relationships, biographyRecords] = await Promise.all([
      shouldListPersonas
        ? prismaClient.profile.findMany({
          where  : personaWhere,
          orderBy: [{ updatedAt: "desc" }],
          select : {
            id    : true,
            bookId: true,
            book  : {
              select: {
                title: true
              }
            },
            persona: {
              select: {
                id          : true,
                name        : true,
                aliases     : true,
                nameType    : true,
                recordSource: true,
                confidence  : true,
                hometown    : true
              }
            }
          }
        })
        : Promise.resolve([]),
      shouldListRelationships
        ? prismaClient.relationship.findMany({
          where  : relationshipWhere,
          orderBy: [{ updatedAt: "desc" }],
          select : {
            id          : true,
            chapterId   : true,
            type        : true,
            weight      : true,
            confidence  : true,
            evidence    : true,
            recordSource: true,
            chapter     : {
              select: {
                no    : true,
                bookId: true,
                book  : {
                  select: {
                    title: true
                  }
                }
              }
            },
            source: {
              select: {
                id  : true,
                name: true
              }
            },
            target: {
              select: {
                id  : true,
                name: true
              }
            }
          }
        })
        : Promise.resolve([]),
      shouldListBiography
        ? prismaClient.biographyRecord.findMany({
          where  : biographyWhere,
          orderBy: [{ updatedAt: "desc" }],
          select : {
            id          : true,
            chapterId   : true,
            chapterNo   : true,
            category    : true,
            title       : true,
            location    : true,
            event       : true,
            recordSource: true,
            chapter     : {
              select: {
                bookId: true,
                book  : {
                  select: {
                    title: true
                  }
                }
              }
            },
            persona: {
              select: {
                id  : true,
                name: true
              }
            }
          }
        })
        : Promise.resolve([])
    ]);

    return {
      summary: {
        persona     : personaCount,
        relationship: relationshipCount,
        biography   : biographyCount,
        total       : personaCount + relationshipCount + biographyCount
      },
      personas: personas.map((item) => ({
        id          : item.id,
        bookId      : item.bookId,
        bookTitle   : item.book.title,
        personaId   : item.persona.id,
        name        : item.persona.name,
        aliases     : item.persona.aliases,
        nameType    : item.persona.nameType,
        recordSource: item.persona.recordSource,
        confidence  : item.persona.confidence,
        hometown    : item.persona.hometown,
        status      : ProcessingStatus.DRAFT
      })),
      relationships: relationships.map((item) => ({
        id             : item.id,
        bookId         : item.chapter.bookId,
        bookTitle      : item.chapter.book.title,
        chapterId      : item.chapterId,
        chapterNo      : item.chapter.no,
        sourcePersonaId: item.source.id,
        sourceName     : item.source.name,
        targetPersonaId: item.target.id,
        targetName     : item.target.name,
        type           : item.type,
        weight         : item.weight,
        confidence     : item.confidence,
        evidence       : item.evidence,
        recordSource   : item.recordSource,
        status         : ProcessingStatus.DRAFT
      })),
      biographyRecords: biographyRecords.map((item) => ({
        id          : item.id,
        bookId      : item.chapter.bookId,
        bookTitle   : item.chapter.book.title,
        chapterId   : item.chapterId,
        chapterNo   : item.chapterNo,
        personaId   : item.persona.id,
        personaName : item.persona.name,
        category    : item.category,
        title       : item.title,
        location    : item.location,
        event       : item.event,
        recordSource: item.recordSource,
        status      : ProcessingStatus.DRAFT
      }))
    };
  }

  return {
    listAdminDrafts
  };
}

export const { listAdminDrafts } = createListDraftsService();
