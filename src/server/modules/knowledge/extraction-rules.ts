import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * NER 提取规则 CRUD 服务。
 */

export async function listExtractionRules(params?: { ruleType?: string; genreKey?: string; active?: boolean }) {
  const where: Prisma.ExtractionRuleWhereInput = {};
  if (params?.ruleType) where.ruleType = params.ruleType;
  if (params?.genreKey) where.genreKey = params.genreKey;
  if (params?.active !== undefined) where.isActive = params.active;

  return prisma.extractionRule.findMany({
    where,
    orderBy: [{ ruleType: "asc" }, { sortOrder: "asc" }]
  });
}

export async function createExtractionRule(data: {
  ruleType?  : string;
  content    : string;
  genreKey?  : string;
  sortOrder? : number;
  changeNote?: string;
}) {
  return prisma.extractionRule.create({
    data: {
      ruleType  : data.ruleType ?? "ENTITY",
      content   : data.content,
      genreKey  : data.genreKey,
      sortOrder : data.sortOrder ?? 0,
      changeNote: data.changeNote
    }
  });
}

export async function updateExtractionRule(
  id: string,
  data: {
    content?   : string;
    genreKey?  : string | null;
    sortOrder? : number;
    isActive?  : boolean;
    changeNote?: string;
  }
) {
  return prisma.extractionRule.update({
    where: { id },
    data : {
      ...(data.content !== undefined && { content: data.content }),
      ...(data.genreKey !== undefined && { genreKey: data.genreKey }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive }),
      ...(data.changeNote !== undefined && { changeNote: data.changeNote })
    }
  });
}

export async function deleteExtractionRule(id: string) {
  return prisma.extractionRule.delete({ where: { id } });
}

export async function reorderExtractionRules(ruleType: string, orderedIds: string[]) {
  await prisma.$transaction(
    orderedIds.map((id, index) =>
      prisma.extractionRule.update({
        where: { id },
        data : { sortOrder: index + 1 }
      })
    )
  );
}

export async function previewCombinedRules(ruleType: string, genreKey?: string) {
  const rules = await prisma.extractionRule.findMany({
    where: {
      ruleType,
      isActive: true,
      OR      : [
        { genreKey: null },
        ...(genreKey ? [{ genreKey }] : [])
      ]
    },
    orderBy: { sortOrder: "asc" }
  });

  return {
    ruleType,
    genreKey: genreKey ?? null,
    count   : rules.length,
    combined: rules.map((r, i) => `${i + 1}. ${r.content}`).join("\n"),
    rules   : rules.map(r => ({ id: r.id, content: r.content, genreKey: r.genreKey, sortOrder: r.sortOrder }))
  };
}
