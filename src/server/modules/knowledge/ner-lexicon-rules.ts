import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

export async function listNerLexiconRules(params?: {
  ruleType?  : string;
  bookTypeId?: string;
  active?    : boolean;
}) {
  const where: Prisma.NerLexiconRuleWhereInput = {};
  if (params?.ruleType)   where.ruleType   = params.ruleType;
  if (params?.bookTypeId) where.bookTypeId = params.bookTypeId;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.nerLexiconRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createNerLexiconRule(data: {
  ruleType   : string;
  content    : string;
  bookTypeId?: string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.nerLexiconRule.create({
    data: {
      ruleType  : data.ruleType,
      content   : data.content,
      bookTypeId: data.bookTypeId,
      sortOrder : data.sortOrder ?? 0,
      changeNote: data.changeNote
    }
  });
}

export async function updateNerLexiconRule(
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
      ...(data.content    !== undefined && { content: data.content }),
      ...(data.bookTypeId !== undefined && { bookTypeId: data.bookTypeId }),
      ...(data.sortOrder  !== undefined && { sortOrder: data.sortOrder }),
      ...(data.isActive   !== undefined && { isActive: data.isActive }),
      ...(data.changeNote !== undefined && { changeNote: data.changeNote })
    }
  });
}

export async function deleteNerLexiconRule(id: string) {
  return prisma.nerLexiconRule.delete({ where: { id } });
}

export async function reorderNerLexiconRules(orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.nerLexiconRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}
