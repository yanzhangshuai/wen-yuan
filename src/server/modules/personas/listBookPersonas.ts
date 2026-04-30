/**
 * =============================================================================
 * 文件定位（服务层：书籍人物列表查询）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/personas/listBookPersonas.ts`
 *
 * 模块职责：
 * - 查询指定书籍下可展示的人物档案集合；
 * - 将底层数据映射为前端列表所需的稳定结构（含 local/global 信息）。
 *
 * 业务意义：
 * - 审核与编辑页依赖该列表作为入口数据；
 * - 保证“书内视图”与“全局人物档案”字段分层清晰，避免误展示。
 *
 * 输入输出边界：
 * - 输入：bookId 与可选筛选条件；
 * - 输出：`BookPersonaListItem[]`，作为接口层响应 DTO。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 书籍人物列表项。
 */
export interface BookPersonaListItem {
  /** 人物 ID。 */
  id                         : string;
  /** 书内档案 ID。 */
  profileId                  : string;
  /** 所属书籍 ID。 */
  bookId                     : string;
  /** 标准人物名。 */
  name                       : string;
  /** 书内展示名。 */
  localName                  : string;
  /** 别名列表。 */
  aliases                    : string[];
  /** 性别。 */
  gender                     : string | null;
  /** 籍贯。 */
  hometown                   : string | null;
  /** 姓名类型。 */
  nameType                   : string;
  /** 全局标签。 */
  globalTags                 : string[];
  /** 书内标签。 */
  localTags                  : string[];
  /** 官职/头衔。 */
  officialTitle              : string | null;
  /** 书内小传。 */
  localSummary               : string | null;
  /** 显式维护的首次出场章节 ID。 */
  firstAppearanceChapterId   : string | null;
  /** 显式维护的首次出场章节序号。 */
  firstAppearanceChapterNo   : number | null;
  /** 显式维护的首次出场章节标题。 */
  firstAppearanceChapterTitle: string | null;
  /** 讽刺指数。 */
  ironyIndex                 : number;
  /** 置信度。 */
  confidence                 : number;
  /** 数据来源。 */
  recordSource               : RecordSource;
  /** 审核状态。 */
  status                     : ProcessingStatus;
}

/**
 * 根据来源推导人物展示状态。
 */
function resolvePersonaStatus(recordSource: RecordSource): ProcessingStatus {
  if (recordSource === RecordSource.MANUAL) {
    return ProcessingStatus.VERIFIED;
  }

  return ProcessingStatus.DRAFT;
}

export function createListBookPersonasService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：获取指定书籍的人物列表。
   * 输入：`bookId`。
   * 输出：人物列表（含主档与书内档案字段）。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：无（只读查询）。
   */
  async function listBookPersonas(bookId: string): Promise<BookPersonaListItem[]> {
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

    const profiles = await prismaClient.profile.findMany({
      where: {
        bookId,
        deletedAt: null,
        persona  : {
          deletedAt: null
        }
      },
      orderBy: [{ updatedAt: "desc" }],
      select : {
        id                      : true,
        bookId                  : true,
        localName               : true,
        localSummary            : true,
        officialTitle           : true,
        localTags               : true,
        ironyIndex              : true,
        firstAppearanceChapterId: true,
        firstAppearanceChapter  : {
          select: {
            no   : true,
            title: true
          }
        },
        persona: {
          select: {
            id          : true,
            name        : true,
            aliases     : true,
            gender      : true,
            hometown    : true,
            nameType    : true,
            globalTags  : true,
            confidence  : true,
            recordSource: true
          }
        }
      }
    });

    return profiles.map((profile) => ({
      id                         : profile.persona.id,
      profileId                  : profile.id,
      bookId                     : profile.bookId,
      name                       : profile.persona.name,
      localName                  : profile.localName,
      aliases                    : profile.persona.aliases,
      gender                     : profile.persona.gender,
      hometown                   : profile.persona.hometown,
      nameType                   : profile.persona.nameType,
      globalTags                 : profile.persona.globalTags,
      localTags                  : profile.localTags,
      officialTitle              : profile.officialTitle,
      localSummary               : profile.localSummary,
      firstAppearanceChapterId   : profile.firstAppearanceChapterId,
      firstAppearanceChapterNo   : profile.firstAppearanceChapter?.no ?? null,
      firstAppearanceChapterTitle: profile.firstAppearanceChapter?.title ?? null,
      ironyIndex                 : profile.ironyIndex,
      confidence                 : profile.persona.confidence,
      recordSource               : profile.persona.recordSource,
      status                     : resolvePersonaStatus(profile.persona.recordSource)
    }));
  }

  return { listBookPersonas };
}

export const { listBookPersonas } = createListBookPersonasService();
