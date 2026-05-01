import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * ============================================================================
 * 文件定位：`src/server/modules/personas/getPersonaById.ts`
 * ----------------------------------------------------------------------------
 * 人物详情聚合查询服务。
 *
 * 分层角色：
 * - server module（服务端逻辑层）；
 * - 被 `GET /api/personas/:id` 调用；
 * - 聚合 persona 主档、profiles、biographyRecords、relationships 四类数据。
 *
 * 业务目标：
 * - 输出图谱侧栏/角色资料工作台可直接渲染的“人物详情快照”；
 * - 避免前端二次拼接，减少接口数量与并发请求复杂度。
 *
 * 关键规则：
 * - 仅返回未软删除的数据（deletedAt=null）；
 * - 状态字段采用“recordSource -> 默认状态”的映射，保证历史数据可展示。
 * ============================================================================
 */

export interface PersonaTimelineItem {
  /** `BiographyRecord.id`，时间轴事件主键。 */
  id          : string;
  /** 所属书籍 ID（UUID）。 */
  bookId      : string;
  /** 所属书名（冗余字段，便于前端直接展示）。 */
  bookTitle   : string;
  /** 事件发生所在章节 ID（UUID）。 */
  chapterId   : string;
  /** 章节序号（从 1 开始）。 */
  chapterNo   : number;
  /** 事件分类，映射 `BioCategory`。 */
  category    : string;
  /** 事件标题，可为空。 */
  title       : string | null;
  /** 事件地点，可为空。 */
  location    : string | null;
  /** 事件正文描述。 */
  event       : string;
  /** 数据来源：AI 解析或 MANUAL 人工补全。 */
  recordSource: RecordSource;
  /** 资料确认状态：DRAFT/VERIFIED/REJECTED。 */
  status      : ProcessingStatus;
}

export interface PersonaRelationshipItem {
  /** `Relationship.id`，关系记录主键。 */
  id             : string;
  /** 关系所属书籍 ID。 */
  bookId         : string;
  /** 关系所属书名。 */
  bookTitle      : string;
  /** 关系首次出现章节 ID。 */
  chapterId      : string;
  /** 关系首次出现章节序号。 */
  chapterNo      : number;
  /** 相对当前人物的方向：出边(outgoing)或入边(incoming)。 */
  direction      : "outgoing" | "incoming";
  /** 对端人物 ID。 */
  counterpartId  : string;
  /** 对端人物名称。 */
  counterpartName: string;
  /** 关系类型（如师生、同僚、敌对等）。 */
  type           : string;
  /** 关系权重。 */
  weight         : number;
  /** 原文证据片段，可为空。 */
  evidence       : string | null;
  /** 数据来源：AI 或 MANUAL。 */
  recordSource   : RecordSource;
  /** 资料确认状态。 */
  status         : ProcessingStatus;
}

export interface PersonaBookProfile {
  /** `Profile.id`，书内档案主键。 */
  profileId    : string;
  /** 档案所属书籍 ID。 */
  bookId       : string;
  /** 档案所属书名。 */
  bookTitle    : string;
  /** 该书中的人物称谓。 */
  localName    : string;
  /** 该书中的人物简介。 */
  localSummary : string | null;
  /** 该书中的官职/头衔。 */
  officialTitle: string | null;
  /** 该书中的标签集合。 */
  localTags    : string[];
  /** 该书中的讽刺指数（0~10）。 */
  ironyIndex   : number;
}

export interface PersonaDetailSnapshot {
  /** 人物主键 ID。 */
  id           : string;
  /** 标准姓名。 */
  name         : string;
  /** 别名数组。 */
  aliases      : string[];
  /** 性别，可为空。 */
  gender       : string | null;
  /** 籍贯，可为空。 */
  hometown     : string | null;
  /** 姓名类型（NAMED/TITLE_ONLY）。 */
  nameType     : string;
  /** 数据来源（AI/MANUAL）。 */
  recordSource : RecordSource;
  /** AI 置信度（0~1）。 */
  confidence   : number;
  /** 人物资料确认状态。 */
  status       : ProcessingStatus;
  /** 按书维度展开的档案数据。 */
  profiles     : PersonaBookProfile[];
  /** 生平时间轴事件列表（按 chapterNo 升序）。 */
  timeline     : PersonaTimelineItem[];
  /** 与该人物相关的关系列表（按更新时间倒序）。 */
  relationships: PersonaRelationshipItem[];
}

/**
 * 功能：根据人物数据来源推导初始展示状态。
 * 输入：`recordSource`（AI 或 MANUAL）。
 * 输出：`ProcessingStatus`（MANUAL 直接 VERIFIED，AI 默认为 DRAFT）。
 * 异常：无。
 * 副作用：无。
 */
function resolvePersonaStatus(recordSource: RecordSource): ProcessingStatus {
  if (recordSource === RecordSource.MANUAL) {
    return ProcessingStatus.VERIFIED;
  }

  return ProcessingStatus.DRAFT;
}

export function createGetPersonaByIdService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：聚合查询人物详情快照（主档 + 书内档案 + 时间轴 + 关系）。
   * 输入：`personaId` 人物主键（UUID）。
   * 输出：`PersonaDetailSnapshot`，可直接用于图谱侧栏与角色资料工作台。
   * 异常：人物不存在时抛出 `PersonaNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function getPersonaById(personaId: string): Promise<PersonaDetailSnapshot> {
    // Step 1) 查询人物主档与书内 profiles。
    const persona = await prismaClient.persona.findFirst({
      where: {
        id       : personaId,
        deletedAt: null
      },
      select: {
        id          : true,
        name        : true,
        aliases     : true,
        gender      : true,
        hometown    : true,
        nameType    : true,
        recordSource: true,
        confidence  : true,
        profiles    : {
          where: {
            deletedAt: null,
            book     : { deletedAt: null }
          },
          orderBy: [{ updatedAt: "desc" }],
          select : {
            id           : true,
            bookId       : true,
            localName    : true,
            localSummary : true,
            officialTitle: true,
            localTags    : true,
            ironyIndex   : true,
            book         : {
              select: {
                title: true
              }
            }
          }
        }
      }
    });
    if (!persona) {
      throw new PersonaNotFoundError(personaId);
    }

    // Step 2) 并发查询时间轴与关系，减少总响应时延。
    const [biographyRecords, relationships] = await Promise.all([
      prismaClient.biographyRecord.findMany({
        where: {
          personaId,
          deletedAt: null,
          chapter  : {
            book: { deletedAt: null }
          }
        },
        orderBy: [{ chapterNo: "asc" }, { createdAt: "asc" }],
        select : {
          id          : true,
          chapterId   : true,
          chapterNo   : true,
          category    : true,
          title       : true,
          location    : true,
          event       : true,
          recordSource: true,
          status      : true,
          chapter     : {
            select: {
              bookId: true,
              book  : {
                select: {
                  title: true
                }
              }
            }
          }
        }
      }),
      prismaClient.relationship.findMany({
        where: {
          deletedAt: null,
          OR       : [
            { sourceId: personaId },
            { targetId: personaId }
          ],
          book: { deletedAt: null }
        },
        orderBy: [{ updatedAt: "desc" }],
        select : {
          id                  : true,
          bookId              : true,
          relationshipTypeCode: true,
          recordSource        : true,
          status              : true,
          sourceId            : true,
          targetId            : true,
          book                : {
            select: {
              title: true
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
          },
          events: {
            where  : { deletedAt: null },
            orderBy: [{ chapterNo: "asc" }],
            take   : 1,
            select : {
              chapterId: true,
              chapterNo: true,
              evidence : true
            }
          }
        }
      })
    ]);

    // Step 3) 映射为统一快照结构。
    return {
      id          : persona.id,
      name        : persona.name,
      aliases     : persona.aliases,
      gender      : persona.gender,
      hometown    : persona.hometown,
      nameType    : persona.nameType,
      recordSource: persona.recordSource,
      confidence  : persona.confidence,
      status      : resolvePersonaStatus(persona.recordSource),
      profiles    : persona.profiles.map((item) => ({
        profileId    : item.id,
        bookId       : item.bookId,
        bookTitle    : item.book.title,
        localName    : item.localName,
        localSummary : item.localSummary,
        officialTitle: item.officialTitle,
        localTags    : item.localTags,
        ironyIndex   : item.ironyIndex
      })),
      timeline: biographyRecords.map((item) => ({
        id          : item.id,
        bookId      : item.chapter.bookId,
        bookTitle   : item.chapter.book.title,
        chapterId   : item.chapterId,
        chapterNo   : item.chapterNo,
        category    : item.category,
        title       : item.title,
        location    : item.location,
        event       : item.event,
        recordSource: item.recordSource,
        status      : item.status
      })),
      relationships: relationships.map((item) => {
        // 方向是相对“当前人物”定义的业务语义：
        // - sourceId===personaId -> outgoing
        // - 否则 -> incoming
        const isOutgoing = item.sourceId === personaId;
        const counterpart = isOutgoing ? item.target : item.source;

        return {
          id             : item.id,
          bookId         : item.bookId,
          bookTitle      : item.book.title,
          chapterId      : item.events[0]?.chapterId ?? "",
          chapterNo      : item.events[0]?.chapterNo ?? 0,
          direction      : isOutgoing ? "outgoing" : "incoming",
          counterpartId  : counterpart.id,
          counterpartName: counterpart.name,
          type           : item.relationshipTypeCode,
          weight         : 1,
          evidence       : item.events[0]?.evidence ?? null,
          recordSource   : item.recordSource,
          status         : item.status
        };
      })
    };
  }

  return {
    getPersonaById
  };
}

export const { getPersonaById } = createGetPersonaByIdService();
export { PersonaNotFoundError };
