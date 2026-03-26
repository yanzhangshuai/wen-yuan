import type { PrismaClient } from "@/generated/prisma/client";
import { type NameType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import { PersonaNotFoundError } from "@/server/modules/personas/errors";

/**
 * 人物更新输入。
 */
export interface UpdatePersonaInput {
  /** 新标准名。 */
  name?      : string;
  /** 新别名集合。 */
  aliases?   : string[];
  /** 新性别。 */
  gender?    : string | null;
  /** 新籍贯。 */
  hometown?  : string | null;
  /** 新姓名类型。 */
  nameType?  : NameType;
  /** 新全局标签集合。 */
  globalTags?: string[];
  /** 新置信度。 */
  confidence?: number;
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
        name?      : string;
        aliases?   : string[];
        gender?    : string | null;
        hometown?  : string | null;
        nameType?  : NameType;
        globalTags?: string[];
        confidence?: number;
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

      return {
        id        : updated.id,
        name      : updated.name,
        aliases   : updated.aliases,
        gender    : updated.gender,
        hometown  : updated.hometown,
        nameType  : updated.nameType,
        globalTags: updated.globalTags,
        confidence: updated.confidence,
        updatedAt : updated.updatedAt.toISOString()
      };
    });
  }

  return { updatePersona };
}

export const { updatePersona } = createUpdatePersonaService();
