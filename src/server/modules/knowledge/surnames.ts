import { type Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 姓氏库 CRUD 服务。
 */

export async function listSurnames(params?: { compound?: boolean; q?: string; active?: boolean }) {
  const where: Prisma.SurnameEntryWhereInput = {};
  if (params?.compound !== undefined) where.isCompound = params.compound;
  if (params?.active !== undefined) where.isActive = params.active;
  if (params?.q) where.surname = { contains: params.q };

  return prisma.surnameEntry.findMany({
    where,
    orderBy: [{ isCompound: "desc" }, { priority: "desc" }, { surname: "asc" }],
    include: { bookType: { select: { id: true, key: true, name: true } } }
  });
}

export async function createSurname(data: {
  surname     : string;
  isCompound? : boolean;
  priority?   : number;
  description?: string;
  bookTypeId? : string;
  source?     : string;
}) {
  return prisma.surnameEntry.create({
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
  data: {
    priority?   : number;
    description?: string;
    bookTypeId? : string | null;
    isActive?   : boolean;
  }
) {
  return prisma.surnameEntry.update({
    where: { id },
    data : {
      ...(data.priority !== undefined && { priority: data.priority }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.bookTypeId !== undefined && { bookTypeId: data.bookTypeId }),
      ...(data.isActive !== undefined && { isActive: data.isActive })
    }
  });
}

export async function deleteSurname(id: string) {
  return prisma.surnameEntry.delete({ where: { id } });
}

export async function importSurnames(text: string) {
  const surnames = text.split(/[,\n，、\s]+/).map(s => s.trim()).filter(Boolean);
  const unique = [...new Set(surnames)];
  let created = 0;

  for (const surname of unique) {
    const existing = await prisma.surnameEntry.findUnique({ where: { surname } });
    if (existing) continue;

    await prisma.surnameEntry.create({
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

export async function testSurnameExtraction(name: string) {
  const entries = await prisma.surnameEntry.findMany({
    where  : { isActive: true },
    orderBy: [{ priority: "desc" }, { surname: "asc" }],
    select : { surname: true, isCompound: true, priority: true }
  });

  // 优先匹配复姓
  if (name.length >= 2) {
    const twoChar = name.slice(0, 2);
    const match = entries.find(e => e.surname === twoChar && e.isCompound);
    if (match) {
      return { input: name, extractedSurname: match.surname, matchType: "compound", priority: match.priority };
    }
  }

  // 单姓匹配
  if (name.length >= 1) {
    const oneChar = name.slice(0, 1);
    const match = entries.find(e => e.surname === oneChar && !e.isCompound);
    if (match) {
      return { input: name, extractedSurname: match.surname, matchType: "single", priority: match.priority };
    }
  }

  return { input: name, extractedSurname: null, matchType: "not_found", priority: 0 };
}
