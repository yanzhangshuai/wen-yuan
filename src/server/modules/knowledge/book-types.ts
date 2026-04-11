import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";

/**
 * 书籍类型 CRUD 服务。
 */

/** 列出所有书籍类型（管理端：含未激活）。 */
export async function listBookTypes(params?: { active?: boolean }) {
  const where: Prisma.BookTypeWhereInput = {};
  if (params?.active !== undefined) {
    where.isActive = params.active;
  }

  return prisma.bookType.findMany({
    where,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    include: {
      _count: {
        select: {
          books         : true,
          knowledgePacks: true
        }
      }
    }
  });
}

/** 列出启用的书籍类型（公开接口：导入页下拉）。 */
export async function listActiveBookTypes() {
  return prisma.bookType.findMany({
    where  : { isActive: true },
    orderBy: { sortOrder: "asc" },
    select : { id: true, key: true, name: true, sortOrder: true }
  });
}

/** 获取单个书籍类型详情。 */
export async function getBookType(id: string) {
  return prisma.bookType.findUnique({
    where  : { id },
    include: {
      _count: {
        select: {
          books         : true,
          knowledgePacks: true
        }
      }
    }
  });
}

/** 创建书籍类型。 */
export async function createBookType(data: {
  key          : string;
  name         : string;
  description? : string;
  presetConfig?: Prisma.InputJsonValue;
  sortOrder?   : number;
}) {
  return prisma.bookType.create({
    data: {
      key         : data.key,
      name        : data.name,
      description : data.description,
      presetConfig: data.presetConfig,
      sortOrder   : data.sortOrder ?? 0
    }
  });
}

/** 更新书籍类型。 */
export async function updateBookType(
  id: string,
  data: {
    key?         : string;
    name?        : string;
    description? : string;
    presetConfig?: Prisma.InputJsonValue | null;
    sortOrder?   : number;
    isActive?    : boolean;
  }
) {
  return prisma.bookType.update({
    where: { id },
    data : {
      ...(data.key !== undefined && { key: data.key }),
      ...(data.name !== undefined && { name: data.name }),
      ...(data.description !== undefined && { description: data.description }),
      ...(data.presetConfig !== undefined && {
        presetConfig: data.presetConfig === null ? Prisma.JsonNull : data.presetConfig
      }),
      ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      ...(data.isActive !== undefined && { isActive: data.isActive })
    }
  });
}

/** 删除书籍类型（检查关联）。 */
export async function deleteBookType(id: string) {
  const bt = await prisma.bookType.findUnique({
    where  : { id },
    include: { _count: { select: { books: true } } }
  });

  if (!bt) {
    throw new Error("书籍类型不存在");
  }

  if (bt._count.books > 0) {
    throw new Error(`该书籍类型下仍有 ${bt._count.books} 本书籍，请先迁移后再删除`);
  }

  return prisma.bookType.delete({ where: { id } });
}
