import type { PrismaClient } from "@/generated/prisma/client";
import {
  NameType,
  PersonaType,
  ProcessingStatus,
  RecordSource
} from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

/**
 * 手动新增人物输入。
 */
export interface CreateBookPersonaInput {
  /** 标准人物名称。 */
  name          : string;
  /** 别名集合。 */
  aliases?      : string[];
  /** 性别。 */
  gender?       : string | null;
  /** 籍贯。 */
  hometown?     : string | null;
  /** 姓名类型（NAMED/TITLE_ONLY）。 */
  nameType?     : NameType;
  /** 全局标签集合。 */
  globalTags?   : string[];
  /** 该书内展示名。 */
  localName?    : string;
  /** 该书内小传。 */
  localSummary? : string | null;
  /** 官职/头衔。 */
  officialTitle?: string | null;
  /** 该书内标签。 */
  localTags?    : string[];
  /** 讽刺指数。 */
  ironyIndex?   : number;
  /** 置信度。 */
  confidence?   : number;
}

/**
 * 手动新增人物结果。
 */
export interface CreateBookPersonaResult {
  /** 人物 ID。 */
  id           : string;
  /** 书内档案 ID。 */
  profileId    : string;
  /** 所属书籍 ID。 */
  bookId       : string;
  /** 标准名。 */
  name         : string;
  /** 书内展示名。 */
  localName    : string;
  /** 别名。 */
  aliases      : string[];
  /** 性别。 */
  gender       : string | null;
  /** 籍贯。 */
  hometown     : string | null;
  /** 姓名类型。 */
  nameType     : NameType;
  /** 全局标签。 */
  globalTags   : string[];
  /** 书内标签。 */
  localTags    : string[];
  /** 书内小传。 */
  localSummary : string | null;
  /** 官职/头衔。 */
  officialTitle: string | null;
  /** 讽刺指数。 */
  ironyIndex   : number;
  /** 置信度。 */
  confidence   : number;
  /** 数据来源（MANUAL）。 */
  recordSource : RecordSource;
  /** 审核状态（VERIFIED）。 */
  status       : ProcessingStatus;
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
   * 功能：在指定书籍中手动创建人物及其书内档案。
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
          personaId    : persona.id,
          bookId,
          localName    : input.localName?.trim() || normalizedName,
          localSummary : normalizeNullableText(input.localSummary),
          officialTitle: normalizeNullableText(input.officialTitle),
          localTags    : normalizeDistinctItems(input.localTags),
          ironyIndex   : input.ironyIndex ?? 0
        },
        select: {
          id           : true,
          localName    : true,
          localSummary : true,
          officialTitle: true,
          localTags    : true,
          ironyIndex   : true
        }
      });

      return {
        id           : persona.id,
        profileId    : profile.id,
        bookId,
        name         : persona.name,
        localName    : profile.localName,
        aliases      : persona.aliases,
        gender       : persona.gender,
        hometown     : persona.hometown,
        nameType     : persona.nameType,
        globalTags   : persona.globalTags,
        localTags    : profile.localTags,
        localSummary : profile.localSummary,
        officialTitle: profile.officialTitle,
        ironyIndex   : profile.ironyIndex,
        confidence   : persona.confidence,
        recordSource : persona.recordSource,
        status       : ProcessingStatus.VERIFIED
      };
    });
  }

  return { createBookPersona };
}

export const { createBookPersona } = createCreateBookPersonaService();
