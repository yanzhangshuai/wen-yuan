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
