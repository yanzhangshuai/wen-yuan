import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * NER 提取规则 CRUD 服务。
 */

export async function listExtractionRules(params?: { ruleType?: string; bookTypeId?: string; active?: boolean }) {
  const where: Prisma.NerLexiconRuleWhereInput = {};
  if (params?.ruleType) where.ruleType = params.ruleType;
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.nerLexiconRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createExtractionRule(data: {
  ruleType?  : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.nerLexiconRule.create({
    data: {
      ruleType  : data.ruleType ?? "ENTITY",
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
  return prisma.nerLexiconRule.update({
    where: { id },
    data : {
      ...(data.content !== undefined && { content: data.content }),
      ...(data.bookTypeId !== undefined && { bookTypeId: data.bookTypeId }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.changeNote !== undefined && { changeNote: data.changeNote })
    }
  });
}

export async function deleteExtractionRule(id: string) {
  return prisma.nerLexiconRule.delete({ where: { id } });
}

export async function reorderExtractionRules(ruleType: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.nerLexiconRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}

export async function previewCombinedRules(ruleType: string, bookTypeId?: string) {
  const rules = await prisma.nerLexiconRule.findMany({
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
    combined  : rules.map((r, i) => `${i + 1}. ${r.content}`).join("\n"),
    rules     : rules.map(r => ({ id: r.id, content: r.content, bookTypeId: r.bookTypeId, sortOrder: r.sortOrder }))
  };
}
