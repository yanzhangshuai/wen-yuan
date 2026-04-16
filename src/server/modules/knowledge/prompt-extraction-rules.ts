import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export async function listPromptExtractionRules(params?: {
  ruleType?  : string;
  bookTypeId?: string;
  active?    : boolean;
}) {
  const where: Prisma.PromptExtractionRuleWhereInput = {};
  if (params?.ruleType)   where.ruleType   = params.ruleType;
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.promptExtractionRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createPromptExtractionRule(data: {
  ruleType   : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.promptExtractionRule.create({
    data: {
      ruleType  : data.ruleType,
      content   : data.content,
      bookTypeId: data.bookTypeId,
      sortOrder : data.sortOrder ?? 0,
      changeNote: data.changeNote
    }
  });
}

export async function updatePromptExtractionRule(
  id: string,
  data: {
    content?   : string;
    bookTypeId?: string | null;
    sortOrder? : number;
    isActive?  : boolean;
    changeNote?: string;
  }
) {
  return prisma.promptExtractionRule.update({
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

export async function deletePromptExtractionRule(id: string) {
  return prisma.promptExtractionRule.delete({ where: { id } });
}

export async function batchDeletePromptExtractionRules(ids: string[]) {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.promptExtractionRule.delete({ where: { id } }))
  );
  return { count: result.length };
}

export async function batchTogglePromptExtractionRules(ids: string[], isActive: boolean) {
  const result = await prisma.$transaction(
    ids.map((id) =>
      prisma.promptExtractionRule.update({
        where: { id },
        data : { isActive }
      })
    )
  );
  return { count: result.length };
}

export async function batchChangeBookTypePromptExtractionRules(ids: string[], bookTypeId: string | null) {
  const result = await prisma.$transaction(
    ids.map((id) =>
      prisma.promptExtractionRule.update({
        where: { id },
        data : { bookTypeId }
      })
    )
  );
  return { count: result.length };
}

export async function reorderPromptExtractionRules(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.promptExtractionRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}

export async function previewCombinedPromptRules(ruleType: string, bookTypeId?: string) {
  const rules = await prisma.promptExtractionRule.findMany({
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
