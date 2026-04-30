/**
 * =============================================================================
 * 文件定位（服务层：书籍内人工补全人物）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/server/modules/personas/createBookPersona.ts`
 *
 * 业务定位：
 * - 处理管理员在特定书籍下手工补录人物档案；
 * - 同步写入全局人物信息与书内 profile 信息（同一事务内保证一致）。
 *
 * 上下游关系：
 * - 上游：`POST /api/books/:id/personas`（或等价入口）；
 * - 下游：Prisma 的 persona / bookPersonaProfile / alias 等数据表。
 *
 * 维护重点：
 * - local/global 字段语义不能混用（一个用于书内呈现，一个用于跨书标准化）；
 * - 默认值（如置信度、来源）体现审核业务规则，变更需要联动前端筛选与统计逻辑。
 * =============================================================================
 */
import type { PrismaClient } from "@/generated/prisma/client";
import {
  NameType,
  PersonaType,
  ProcessingStatus,
  RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";
import { PersonaInputError } from "@/server/modules/personas/errors";

/**
 * 手动新增人物输入。
 */
export interface CreateBookPersonaInput {
  /** 标准人物名称。 */
  name                     : string;
  /** 别名集合。 */
  aliases?                 : string[];
  /** 性别。 */
  gender?                  : string | null;
  /** 籍贯。 */
  hometown?                : string | null;
  /** 姓名类型（NAMED/TITLE_ONLY）。 */
  nameType?                : NameType;
  /** 全局标签集合。 */
  globalTags?              : string[];
  /** 该书内展示名。 */
  localName?               : string;
  /** 该书内小传。 */
  localSummary?            : string | null;
  /** 官职/头衔。 */
  officialTitle?           : string | null;
  /** 该书内标签。 */
  localTags?               : string[];
  /** 讽刺指数。 */
  ironyIndex?              : number;
  /** 首次出场章节 ID。 */
  firstAppearanceChapterId?: string | null;
  /** 置信度。 */
  confidence?              : number;
}

/**
 * 手动新增人物结果。
 */
export interface CreateBookPersonaResult {
  /** 人物 ID。 */
  id                         : string;
  /** 书内档案 ID。 */
  profileId                  : string;
  /** 所属书籍 ID。 */
  bookId                     : string;
  /** 标准名。 */
  name                       : string;
  /** 书内展示名。 */
  localName                  : string;
  /** 别名。 */
  aliases                    : string[];
  /** 性别。 */
  gender                     : string | null;
  /** 籍贯。 */
  hometown                   : string | null;
  /** 姓名类型。 */
  nameType                   : NameType;
  /** 全局标签。 */
  globalTags                 : string[];
  /** 书内标签。 */
  localTags                  : string[];
  /** 书内小传。 */
  localSummary               : string | null;
  /** 官职/头衔。 */
  officialTitle              : string | null;
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
  /** 数据来源（MANUAL）。 */
  recordSource               : RecordSource;
  /** 资料确认状态（VERIFIED）。 */
  status                     : ProcessingStatus;
}

/**
 * 去重并标准化字符串数组。
 */
function normalizeDistinctItems(items: string[] | undefined): string[] {
  if (!items) {
    return [];
  }

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
function normalizeNullableText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}

export function createCreateBookPersonaService(
  prismaClient: PrismaClient = prisma
) {
  /**
   * 功能：在指定书籍中人工补全人物及其书内档案。
   * 输入：`bookId` + 人物与档案字段。
   * 输出：人物创建结果快照。
   * 异常：书籍不存在时抛出 `BookNotFoundError`。
   * 副作用：写入 `persona` + `profile`，人物来源标记为 `MANUAL`。
   */
  async function createBookPersona(
    bookId: string,
    input: CreateBookPersonaInput
  ): Promise<CreateBookPersonaResult> {
    return prismaClient.$transaction(async (tx) => {
      const book = await tx.book.findFirst({
        where: {
          id       : bookId,
          deletedAt: null
        },
        select: { id: true }
      });
      if (!book) {
        throw new BookNotFoundError(bookId);
      }

      const firstAppearanceChapter = input.firstAppearanceChapterId
        ? await tx.chapter.findFirst({
          where: {
            id: input.firstAppearanceChapterId,
            bookId
          },
          select: {
            id   : true,
            no   : true,
            title: true
          }
        })
        : null;
      if (input.firstAppearanceChapterId && !firstAppearanceChapter) {
        throw new PersonaInputError("出场章节不属于当前书籍");
      }

      const normalizedName = input.name.trim();
      const persona = await tx.persona.create({
        data: {
          name        : normalizedName,
          type        : PersonaType.PERSON,
          aliases     : normalizeDistinctItems(input.aliases),
          gender      : normalizeNullableText(input.gender),
          hometown    : normalizeNullableText(input.hometown),
          nameType    : input.nameType ?? NameType.NAMED,
          recordSource: RecordSource.MANUAL,
          globalTags  : normalizeDistinctItems(input.globalTags),
          confidence  : input.confidence ?? 1
        },
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
      });

      const profile = await tx.profile.create({
        data: {
          personaId               : persona.id,
          bookId,
          localName               : input.localName?.trim() || normalizedName,
          localSummary            : normalizeNullableText(input.localSummary),
          officialTitle           : normalizeNullableText(input.officialTitle),
          localTags               : normalizeDistinctItems(input.localTags),
          ironyIndex              : input.ironyIndex ?? 0,
          firstAppearanceChapterId: firstAppearanceChapter?.id ?? null
        },
        select: {
          id                      : true,
          localName               : true,
          localSummary            : true,
          officialTitle           : true,
          localTags               : true,
          ironyIndex              : true,
          firstAppearanceChapterId: true
        }
      });

      return {
        id                         : persona.id,
        profileId                  : profile.id,
        bookId,
        name                       : persona.name,
        localName                  : profile.localName,
        aliases                    : persona.aliases,
        gender                     : persona.gender,
        hometown                   : persona.hometown,
        nameType                   : persona.nameType,
        globalTags                 : persona.globalTags,
        localTags                  : profile.localTags,
        localSummary               : profile.localSummary,
        officialTitle              : profile.officialTitle,
        firstAppearanceChapterId   : profile.firstAppearanceChapterId,
        firstAppearanceChapterNo   : firstAppearanceChapter?.no ?? null,
        firstAppearanceChapterTitle: firstAppearanceChapter?.title ?? null,
        ironyIndex                 : profile.ironyIndex,
        confidence                 : persona.confidence,
        recordSource               : persona.recordSource,
        status                     : ProcessingStatus.VERIFIED
      };
    });
  }

  return { createBookPersona };
}

export const { createBookPersona } = createCreateBookPersonaService();
