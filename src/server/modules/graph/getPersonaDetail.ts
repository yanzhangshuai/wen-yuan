import type { PrismaClient } from "@/generated/prisma/client";
import {
  FactType,
  ProcessingStatus,
  type RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { lookupRelationshipTypeNames } from "@/server/modules/skills";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/graph/getPersonaDetail.ts`
 * ----------------------------------------------------------------------------
 * 图谱人物详情查询服务（单书域）。
 *
 * 业务职责：
 * - 在“一本书”的语境下聚合某个人物的完整展示数据：
 *   Entity 主档（别名/籍贯/性别/标签/小传）+ 书级档案（称谓/官职/讽刺指数）
 *   + 直接关系列表 + 生平时间轴（BIOGRAPHY 事实）+ 出场统计。
 *
 * 数据权威源：
 * - 关系来自 `relationships` 物化聚合表（facts 是权威源，本表由聚合器重建）；
 * - 时间轴来自 `facts` 表（BIOGRAPHY 事实，payload 内存储 title/location/event/tags）。
 *
 * 分层约束：
 * - 不处理 HTTP、不返回 Response；对外只抛领域错误；
 * - 供 `GET /api/books/:id/personas/:personaId` 与图谱详情面板消费。
 * ============================================================================
 */

/** 指定人物在当前书域图谱内不存在。 */
export class PersonaNotFoundError extends Error {
  /** 不存在的人物 ID。 */
  readonly personaId: string;

  /**
   * @param personaId 人物主键 ID。
   */
  constructor(personaId: string) {
    super(`Persona not found: ${personaId}`);
    this.personaId = personaId;
  }
}

/** 查询输入：限定在单本书图谱域内。 */
export interface GetPersonaDetailInput {
  /** 书籍 ID（UUID）。 */
  bookId   : string;
  /** 人物 ID（UUID）。 */
  personaId: string;
}

/** 书级人物档案（EntityProfile 的展示投影）。 */
export interface PersonaDetailProfile {
  /** 书中称呼，如"范老爷"。 */
  localName               : string;
  /** AI 汇总的本书小传。 */
  localSummary            : string | null;
  /** 书中最终官职。 */
  officialTitle           : string | null;
  /** 性格/社会角色标签。 */
  localTags               : string[];
  /** 讽刺指数（0-10）。 */
  ironyIndex              : number;
  /** 首次出场章节号（手动维护，缺省为 null）。 */
  firstAppearanceChapterNo: number | null;
  /** 档案审核状态。 */
  status                  : ProcessingStatus;
}

/** 人物直接关系条目（已聚合、可读化）。 */
export interface PersonaDetailRelationship {
  /** 关系 ID。 */
  id             : string;
  /** 关系对象人物 ID。 */
  counterpartId  : string;
  /** 关系对象人物展示名。 */
  counterpartName: string;
  /** 关系类型展示名（如"师徒"）。 */
  type           : string;
  /** 关系强度（底层事实数）。 */
  factCount      : number;
  /** 关系审核状态。 */
  status         : ProcessingStatus;
  /** 关系首次出现章节号。 */
  firstChapterNo : number | null;
  /** 关系最近出现章节号。 */
  latestChapterNo: number | null;
}

/** 人物生平时间轴事件（BIOGRAPHY 事实投影）。 */
export interface PersonaDetailTimelineEvent {
  /** 事件 ID。 */
  id          : string;
  /** 事件所属章节 ID（用于证据跳转）。 */
  chapterId   : string;
  /** 章节号。 */
  chapterNo   : number;
  /** 事件类别（BIRTH/EXAM/CAREER/...）。 */
  category    : string;
  /** 事件标题（可空）。 */
  title       : string | null;
  /** 事件地点（可空）。 */
  location    : string | null;
  /** 事件正文。 */
  event       : string;
  /** 虚拟年份（可空）。 */
  virtualYear : string | null;
  /** 事件标签。 */
  tags        : string[];
  /** 记录来源。 */
  recordSource: RecordSource;
  /** 审核状态。 */
  status      : ProcessingStatus;
}

/** 人物详情聚合结果。 */
export interface PersonaDetailResult {
  /** 人物 ID。 */
  id                      : string;
  /** 全局标准名（如"范进"）。 */
  name                    : string;
  /** 人名类型（NAMED/TITLE_ONLY）。 */
  nameType                : string;
  /** 实体类型（PERSON/LOCATION/...）。 */
  entityType              : string;
  /** 节点审核状态（由记录来源推导）。 */
  status                  : ProcessingStatus;
  /** AI 置信度。 */
  confidence              : number;
  /** 性别（可空）。 */
  gender                  : string | null;
  /** 籍贯（可空）。 */
  hometown                : string | null;
  /** 别名列表。 */
  aliases                 : string[];
  /** 全局标签。 */
  globalTags              : string[];
  /** 全局小传（可空）。 */
  summary                 : string | null;
  /** 书级档案（当前书语境；缺失时为 null）。 */
  profile                 : PersonaDetailProfile | null;
  /** 当前书内的直接关系列表。 */
  relationships           : PersonaDetailRelationship[];
  /** 当前书内的生平时间轴。 */
  timeline                : PersonaDetailTimelineEvent[];
  /** 当前书内的原文提及次数（出场统计）。 */
  appearanceCount         : number;
  /** 首次出场章节号（档案优先，缺省为 null）。 */
  firstAppearanceChapterNo: number | null;
}

/** 由记录来源推导节点审核状态（与图谱快照口径一致）。 */
function resolveNodeStatus(recordSource: RecordSource): ProcessingStatus {
  if (recordSource === "MANUAL") {
    return ProcessingStatus.VERIFIED;
  }
  return ProcessingStatus.DRAFT;
}

/** 从 Fact.payload 读取 BIOGRAPHY 展示字段（容错解析，字段缺失给默认值）。 */
function readEventPayload(payload: unknown): {
  title   : string | null;
  location: string | null;
  event   : string;
  tags    : string[];
} {
  const raw = (payload ?? {}) as Record<string, unknown>;
  // v7/v5 BIOGRAPHY 事实正文存于 payload.summary；历史 v4 数据用 payload.event 兜底。
  const summary = typeof raw.summary === "string" ? raw.summary : "";
  const event = typeof raw.event === "string" ? raw.event : "";
  return {
    title   : typeof raw.title === "string" ? raw.title : null,
    location: typeof raw.location === "string" ? raw.location : null,
    event   : summary || event,
    tags    : Array.isArray(raw.tags)
      ? raw.tags.filter((tag): tag is string => typeof tag === "string")
      : []
  };
}

/**
 * 创建人物详情服务（工厂模式，便于测试替换数据库客户端）。
 */
export function createGetPersonaDetailService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 获取单本书域内的人物详情。
   * @param input 书籍 ID + 人物 ID。
   * @returns 人物详情聚合结果。
   * @throws BookNotFoundError 书籍不存在。
   * @throws PersonaNotFoundError 人物不在该书图谱域内。
   */
  async function getPersonaDetail(input: GetPersonaDetailInput): Promise<PersonaDetailResult> {
    const { bookId, personaId } = input;

    // Step 1) 校验书籍存在，避免后续多表查询无意义执行。
    const book = await prismaClient.book.findFirst({
      where: {
        id       : bookId,
        deletedAt: null
      },
      select: { id: true }
    });
    if (!book) {
      throw new BookNotFoundError(bookId);
    }

    // Step 2) 读取实体主档（全局维度信息）。
    const entity = await prismaClient.entity.findFirst({
      where: {
        id       : personaId,
        deletedAt: null
      },
      select: {
        id          : true,
        name        : true,
        nameType    : true,
        entityType  : true,
        recordSource: true,
        confidence  : true,
        gender      : true,
        hometown    : true,
        globalTags  : true,
        aliases     : true,
        summary     : true
      }
    });
    if (!entity) {
      throw new PersonaNotFoundError(personaId);
    }

    // Step 3) 并行读取：书级档案、直接关系、生平时间轴、出场统计。
    const profile = await prismaClient.entityProfile.findFirst({
      where: {
        entityId : personaId,
        bookId,
        deletedAt: null
      },
      select: {
        localName             : true,
        localSummary          : true,
        officialTitle         : true,
        localTags             : true,
        ironyIndex            : true,
        status                : true,
        firstAppearanceChapter: { select: { no: true } }
      }
    });

    const [relationshipRows, timelineRows, appearanceCount] = await Promise.all([
      prismaClient.relationship.findMany({
        where: {
          bookId,
          deletedAt: null,
          OR       : [
            { sourceEntityId: personaId },
            { targetEntityId: personaId }
          ]
        },
        orderBy: [{ weight: "desc" }],
        select : {
          id                  : true,
          sourceEntityId      : true,
          targetEntityId      : true,
          relationshipTypeCode: true,
          factCount           : true,
          status              : true,
          firstChapterNo      : true,
          latestChapterNo     : true,
          source              : { select: { id: true, name: true } },
          target              : { select: { id: true, name: true } }
        }
      }),
      prismaClient.fact.findMany({
        where: {
          bookId,
          sourceEntityId: personaId,
          factType      : FactType.BIOGRAPHY,
          deletedAt     : null,
          status        : { not: ProcessingStatus.REJECTED }
        },
        orderBy: [{ chapterNo: "asc" }, { updatedAt: "asc" }],
        select : {
          id           : true,
          chapterId    : true,
          chapterNo    : true,
          eventCategory: true,
          virtualYear  : true,
          payload      : true,
          recordSource : true,
          status       : true
        }
      }),
      prismaClient.mention.count({
        where: {
          entityId : personaId,
          deletedAt: null,
          chapter  : { bookId }
        }
      })
    ]);

    // Step 4) 关系类型码 → 展示名（与图谱边口径一致）。
    const typeCodes = [...new Set(relationshipRows.map(row => row.relationshipTypeCode))];
    const nameByCode = await lookupRelationshipTypeNames(typeCodes, prismaClient);

    const relationships: PersonaDetailRelationship[] = relationshipRows.map(rel => {
      // 关系对象 = 非当前人物的另一端。
      const counterpart = rel.sourceEntityId === personaId ? rel.target : rel.source;
      return {
        id             : rel.id,
        counterpartId  : counterpart.id,
        counterpartName: counterpart.name,
        type           : nameByCode.get(rel.relationshipTypeCode) ?? rel.relationshipTypeCode,
        factCount      : rel.factCount,
        status         : rel.status,
        firstChapterNo : rel.firstChapterNo,
        latestChapterNo: rel.latestChapterNo
      };
    });

    const timeline: PersonaDetailTimelineEvent[] = timelineRows.map(row => {
      const payload = readEventPayload(row.payload);
      return {
        id          : row.id,
        chapterId   : row.chapterId,
        chapterNo   : row.chapterNo,
        category    : row.eventCategory ?? "EVENT",
        title       : payload.title,
        location    : payload.location,
        event       : payload.event,
        virtualYear : row.virtualYear,
        tags        : payload.tags,
        recordSource: row.recordSource,
        status      : row.status
      };
    });

    const firstAppearanceChapterNo = profile?.firstAppearanceChapter?.no ?? null;

    return {
      id        : entity.id,
      name      : entity.name,
      nameType  : entity.nameType,
      entityType: entity.entityType,
      status    : resolveNodeStatus(entity.recordSource),
      confidence: entity.confidence,
      gender    : entity.gender,
      hometown  : entity.hometown,
      aliases   : entity.aliases,
      globalTags: entity.globalTags,
      summary   : entity.summary,
      profile   : profile ? {
        localName               : profile.localName,
        localSummary            : profile.localSummary,
        officialTitle           : profile.officialTitle,
        localTags               : profile.localTags,
        ironyIndex              : profile.ironyIndex,
        status                  : profile.status,
        firstAppearanceChapterNo: firstAppearanceChapterNo
      } : null,
      relationships,
      timeline,
      appearanceCount,
      firstAppearanceChapterNo
    };
  }

  return {
    getPersonaDetail
  };
}

export const { getPersonaDetail } = createGetPersonaDetailService();
