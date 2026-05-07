import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 统一提取规则 CRUD 服务。
 * 合并此前 ner_lexicon_rules 和 prompt_extraction_rules 两张表，
 * ruleType 现在支持全部 6 种类型：
 *   HARD_BLOCK_SUFFIX | SOFT_BLOCK_SUFFIX | TITLE_STEM | POSITION_STEM | ENTITY | RELATIONSHIP
 */

export async function listExtractionRules(params?: {
  ruleType?  : string;
  bookTypeId?: string;
  active?    : boolean;
}) {
  const where: Prisma.ExtractionRuleWhereInput = {};
  if (params?.ruleType)   where.ruleType   = params.ruleType;
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.extractionRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createExtractionRule(data: {
  ruleType   : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.extractionRule.create({
    data: {
      ruleType  : data.ruleType,
      content   : data.content,
      bookTypeId: data.bookTypeId,
      sortOrder : data.sortOrder ?? 0,
      changeNote: data.changeNote
    }
  });
}

export async function updateExtractionRule(
  id: string,
  data: {
    content?   : string;
    bookTypeId?: string | null;
    sortOrder? : number;
    isActive?  : boolean;
    changeNote?: string;
  }
) {
  return prisma.extractionRule.update({
    where: { id },
    data : {
      ...(data.content    !== undefined && { content: data.content }),
      ...(data.bookTypeId !== undefined && { bookTypeId: data.bookTypeId }),
      ...(data.sortOrder  !== undefined && { sortOrder: data.sortOrder }),
      ...(data.isActive   !== undefined && { isActive: data.isActive }),
      ...(data.changeNote !== undefined && { changeNote: data.changeNote })
    }
  });
}

export async function deleteExtractionRule(id: string) {
  return prisma.extractionRule.delete({ where: { id } });
}

export async function batchDeleteExtractionRules(ids: string[]) {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.extractionRule.delete({ where: { id } }))
  );
  return { count: result.length };
}

export async function batchToggleExtractionRules(ids: string[], isActive: boolean) {
  const result = await prisma.$transaction(
    ids.map((id) =>
      prisma.extractionRule.update({ where: { id }, data: { isActive } })
    )
  );
  return { count: result.length };
}

export async function batchChangeBookTypeExtractionRules(ids: string[], bookTypeId: string | null) {
  const result = await prisma.$transaction(
    ids.map((id) =>
      prisma.extractionRule.update({ where: { id }, data: { bookTypeId } })
    )
  );
  return { count: result.length };
}

export async function reorderExtractionRules(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.extractionRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}

/** 预览合并后的 Prompt 规则文本（用于 Prompt 注入）。 */
export async function previewCombinedExtractionRules(ruleType: string, bookTypeId?: string) {
  const rules = await prisma.extractionRule.findMany({
    where: {
      ruleType,
      isActive: true,
      OR      : [
        { bookTypeId: null },
        ...(bookTypeId ? [{ bookTypeId }] : [])
      ]
    },
    orderBy: { sortOrder: "asc" }
  });

  return {
    ruleType,
    bookTypeId: bookTypeId ?? null,
    count     : rules.length,
    combined  : rules.map((rule, index) => `${index + 1}. ${rule.content}`).join("\n"),
    rules     : rules.map((rule) => ({
      id        : rule.id,
      content   : rule.content,
      bookTypeId: rule.bookTypeId,
      sortOrder : rule.sortOrder
    }))
  };
}
