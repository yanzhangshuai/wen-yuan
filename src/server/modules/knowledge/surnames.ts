import { prisma } from "@/server/db/prisma";
import { getStaticSurnames } from "./data/surnames";

/**
 * 姓氏服务。
 * 词库完全由静态文件 `data/surnames.ts` 提供，不再查询 DB。
 * CRUD 函数保留用于管理后台维护 DB 条目（不影响运行时提取）。
 */

export interface SurnameViewModel {
  surname     : string;
  isCompound  : boolean;
  priority    : number;
  description : string | null;
  bookTypeId  : string | null;
  bookTypeName: string | null;
  isActive    : boolean;
  source      : string;
}

function buildStaticViewModels(): SurnameViewModel[] {
  const data = getStaticSurnames();
  return [
    ...data.compounds.map((s) => ({
      surname     : s, isCompound  : true, priority    : 10, description : null,
      bookTypeId  : null, bookTypeName: null, isActive    : true, source      : "STATIC"
    })),
    ...data.singles.map((s) => ({
      surname     : s, isCompound  : false, priority    : 0, description : null,
      bookTypeId  : null, bookTypeName: null, isActive    : true, source      : "STATIC"
    }))
  ];
}

export function listSurnames(params?: { compound?: boolean; q?: string }) {
  let items = buildStaticViewModels();

  if (params?.compound !== undefined) {
    items = items.filter((s) => s.isCompound === params.compound);
  }
  if (params?.q) {
    const q = params.q;
    items = items.filter((s) => s.surname.includes(q));
  }

  items.sort((a, b) => {
    if (a.isCompound !== b.isCompound) return a.isCompound ? -1 : 1;
    if (a.priority !== b.priority) return b.priority - a.priority;
    return a.surname.localeCompare(b.surname, "zh-CN");
  });

  return items;
}

export function testSurnameExtraction(name: string) {
  const data = getStaticSurnames();

  if (name.length >= 2) {
    const twoChar = name.slice(0, 2);
    if (data.compounds.includes(twoChar)) {
      return { input: name, extractedSurname: twoChar, matchType: "compound" as const, priority: 10 };
    }
  }
  if (name.length >= 1) {
    const oneChar = name.slice(0, 1);
    if (data.singles.includes(oneChar)) {
      return { input: name, extractedSurname: oneChar, matchType: "single" as const, priority: 0 };
    }
  }
  return { input: name, extractedSurname: null, matchType: "not_found" as const, priority: 0 };
}

export async function createSurname(data: {
  surname     : string;
  isCompound? : boolean;
  priority?   : number;
  description?: string;
  bookTypeId? : string;
  source?     : string;
}) {
  return prisma.surnameRule.create({
    data: {
      surname    : data.surname,
      isCompound : data.isCompound ?? data.surname.length >= 2,
      priority   : data.priority ?? (data.isCompound || data.surname.length >= 2 ? 10 : 0),
      description: data.description,
      bookTypeId : data.bookTypeId,
      source     : data.source ?? "MANUAL"
    }
  });
}

export async function updateSurname(
  id: string,
  data: { priority?: number; description?: string; bookTypeId?: string | null; isActive?: boolean }
) {
  return prisma.surnameRule.update({ where: { id }, data });
}

export async function deleteSurname(id: string) {
  return prisma.surnameRule.delete({ where: { id } });
}

export async function batchDeleteSurnames(ids: string[]) {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.surnameRule.delete({ where: { id } }))
  );
  return { count: result.length };
}

export async function batchToggleSurnames(ids: string[], isActive: boolean) {
  const result = await prisma.$transaction(
    ids.map((id) => prisma.surnameRule.update({ where: { id }, data: { isActive } }))
  );
  return { count: result.length };
}

export async function batchChangeBookTypeSurnames(ids: string[], bookTypeId: string | null) {
  const result = await prisma.$transaction(
    ids.map((id) =>
      prisma.surnameRule.update({ where: { id }, data: { bookTypeId } })
    )
  );
  return { count: result.length };
}

export async function importSurnames(text: string) {
  const surnames = text.split(/[,\n，、\s]+/).map(s => s.trim()).filter(Boolean);
  const unique = [...new Set(surnames)];
  let created = 0;

  for (const surname of unique) {
    const existing = await prisma.surnameRule.findUnique({ where: { surname } });
    if (existing) continue;

    await prisma.surnameRule.create({
      data: {
        surname,
        isCompound: surname.length >= 2,
        priority  : surname.length >= 2 ? 10 : 0,
        source    : "IMPORTED"
      }
    });
    created++;
  }

  return { total: unique.length, created, skipped: unique.length - created };
}
