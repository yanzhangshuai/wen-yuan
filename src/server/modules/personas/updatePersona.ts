/**
 * =============================================================================
 * 文件定位（服务层：人物信息更新）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/personas/updatePersona.ts`
 *
 * 模块职责：
 * - 对单个人物执行部分字段更新（PATCH 语义）；
 * - 维持输入字段校验、空值标准化与结果快照输出一致性。
 *
 * 业务上下游：
 * - 上游：`PATCH /api/personas/:id`；
 * - 下游：Prisma 人物表与接口层返回 DTO。
 *
 * 重要约束：
 * - “至少更新一个字段”是业务规则，目的是避免无效写操作被误判为成功编辑；
 * - `nameType` 等枚举字段与前端筛选逻辑绑定，变更需联动全链路。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import { type NameType, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaInputError, PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * 人物更新输入。
 */
export interface UpdatePersonaInput {
  /** 当前书籍 ID；提供时允许同步更新书内档案字段。 */
  bookId?                  : string;
  /** 新标准名。 */
  name?                    : string;
  /** 新别名集合。 */
  aliases?                 : string[];
  /** 新性别。 */
  gender?                  : string | null;
  /** 新籍贯。 */
  hometown?                : string | null;
  /** 新姓名类型。 */
  nameType?                : NameType;
  /** 新全局标签集合。 */
  globalTags?              : string[];
  /** 新置信度。 */
  confidence?              : number;
  /** 资料确认状态。当前仅支持把 AI 人物确认为有效角色资料。 */
  status?                  : "VERIFIED";
  /** 书内展示名。 */
  localName?               : string;
  /** 书内小传。 */
  localSummary?            : string | null;
  /** 官职/头衔。 */
  officialTitle?           : string | null;
  /** 书内标签。 */
  localTags?               : string[];
  /** 讽刺指数。 */
  ironyIndex?              : number;
  /** 首次出场章节 ID；传 null 表示清空。 */
  firstAppearanceChapterId?: string | null;
}

/**
 * 人物更新结果。
 */
export interface UpdatePersonaResult {
  /** 人物 ID。 */
  id        : string;
  /** 标准名。 */
  name      : string;
  /** 别名集合。 */
  aliases   : string[];
  /** 性别。 */
  gender    : string | null;
  /** 籍贯。 */
  hometown  : string | null;
  /** 姓名类型。 */
  nameType  : NameType;
  /** 全局标签。 */
  globalTags: string[];
  /** 置信度。 */
  confidence: number;
  /** 更新时间（ISO 字符串）。 */
  updatedAt : string;
  /** 可选：同步更新的书内档案。 */
  profile?  : {
    id                         : string;
    bookId                     : string;
    localName                  : string;
    localSummary               : string | null;
    officialTitle              : string | null;
    firstAppearanceChapterId   : string | null;
    firstAppearanceChapterNo   : number | null;
    firstAppearanceChapterTitle: string | null;
    localTags                  : string[];
    ironyIndex                 : number;
    updatedAt                  : string;
  };
}

/**
 * 去重并标准化字符串数组。
 */
function normalizeDistinctItems(items: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const value = item.trim();
    if (!value || seen.has(value)) {
      continue;
    }

    seen.add(value);
    result.push(value);
  }

  return result;
}

/**
 * 可空文本标准化。
 */
function normalizeNullableText(value: string | null): string | null {
  if (value === null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createUpdatePersonaService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：更新人物主档字段。
   * 输入：人物 ID + 更新字段。
   * 输出：更新后人物快照。
   * 异常：人物不存在时抛出 `PersonaNotFoundError`。
   * 副作用：更新 `persona` 表。
   */
  async function updatePersona(
    personaId: string,
    input: UpdatePersonaInput
  ): Promise<UpdatePersonaResult> {
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

      const data: {
        name?        : string;
        aliases?     : string[];
        gender?      : string | null;
        hometown?    : string | null;
        nameType?    : NameType;
        globalTags?  : string[];
        confidence?  : number;
        recordSource?: RecordSource;
      } = {};
      if (input.name !== undefined) {
        data.name = input.name.trim();
      }
      if (input.aliases !== undefined) {
        data.aliases = normalizeDistinctItems(input.aliases);
      }
      if (input.gender !== undefined) {
        data.gender = normalizeNullableText(input.gender);
      }
      if (input.hometown !== undefined) {
        data.hometown = normalizeNullableText(input.hometown);
      }
      if (input.nameType !== undefined) {
        data.nameType = input.nameType;
      }
      if (input.globalTags !== undefined) {
        data.globalTags = normalizeDistinctItems(input.globalTags);
      }
      if (input.confidence !== undefined) {
        data.confidence = input.confidence;
      }
      if (input.status === ProcessingStatus.VERIFIED) {
        data.recordSource = RecordSource.MANUAL;
      }

      const updated = await tx.persona.update({
        where : { id: personaId },
        data,
        select: {
          id        : true,
          name      : true,
          aliases   : true,
          gender    : true,
          hometown  : true,
          nameType  : true,
          globalTags: true,
          confidence: true,
          updatedAt : true
        }
      });

      let profile:
        | {
          id                      : string;
          bookId                  : string;
          localName               : string;
          localSummary            : string | null;
          officialTitle           : string | null;
          firstAppearanceChapterId: string | null;
          firstAppearanceChapter?: {
            no   : number;
            title: string;
          } | null;
          localTags : string[];
          ironyIndex: number;
          updatedAt : Date;
        }
        | null = null;

      const profileData: {
        localName?               : string;
        localSummary?            : string | null;
        officialTitle?           : string | null;
        localTags?               : string[];
        ironyIndex?              : number;
        firstAppearanceChapterId?: string | null;
      } = {};
      if (input.localName !== undefined) {
        profileData.localName = input.localName.trim();
      }
      if (input.localSummary !== undefined) {
        profileData.localSummary = normalizeNullableText(input.localSummary);
      }
      if (input.officialTitle !== undefined) {
        profileData.officialTitle = normalizeNullableText(input.officialTitle);
      }
      if (input.localTags !== undefined) {
        profileData.localTags = normalizeDistinctItems(input.localTags);
      }
      if (input.ironyIndex !== undefined) {
        profileData.ironyIndex = input.ironyIndex;
      }
      if (input.firstAppearanceChapterId !== undefined) {
        profileData.firstAppearanceChapterId = input.firstAppearanceChapterId;
      }

      if (input.bookId !== undefined && Object.keys(profileData).length > 0) {
        if (input.firstAppearanceChapterId) {
          const chapter = await tx.chapter.findFirst({
            where: {
              id    : input.firstAppearanceChapterId,
              bookId: input.bookId
            },
            select: { id: true }
          });
          if (!chapter) {
            throw new PersonaInputError("出场章节不属于当前书籍");
          }
        }

        const existingProfile = await tx.profile.findFirst({
          where: {
            personaId: personaId,
            bookId   : input.bookId,
            deletedAt: null
          },
          select: { id: true }
        });
        if (!existingProfile) {
          throw new PersonaNotFoundError(personaId);
        }

        profile = await tx.profile.update({
          where : { id: existingProfile.id },
          data  : profileData,
          select: {
            id                      : true,
            bookId                  : true,
            localName               : true,
            localSummary            : true,
            officialTitle           : true,
            firstAppearanceChapterId: true,
            firstAppearanceChapter  : {
              select: {
                no   : true,
                title: true
              }
            },
            localTags : true,
            ironyIndex: true,
            updatedAt : true
          }
        });
      }

      return {
        id        : updated.id,
        name      : updated.name,
        aliases   : updated.aliases,
        gender    : updated.gender,
        hometown  : updated.hometown,
        nameType  : updated.nameType,
        globalTags: updated.globalTags,
        confidence: updated.confidence,
        updatedAt : updated.updatedAt.toISOString(),
        ...(profile
          ? {
            profile: {
              id                         : profile.id,
              bookId                     : profile.bookId,
              localName                  : profile.localName,
              localSummary               : profile.localSummary,
              officialTitle              : profile.officialTitle,
              firstAppearanceChapterId   : profile.firstAppearanceChapterId,
              firstAppearanceChapterNo   : profile.firstAppearanceChapter?.no ?? null,
              firstAppearanceChapterTitle: profile.firstAppearanceChapter?.title ?? null,
              localTags                  : profile.localTags,
              ironyIndex                 : profile.ironyIndex,
              updatedAt                  : profile.updatedAt.toISOString()
            }
          }
          : {})
      };
    });
  }

  return { updatePersona };
}

export const { updatePersona } = createUpdatePersonaService();
