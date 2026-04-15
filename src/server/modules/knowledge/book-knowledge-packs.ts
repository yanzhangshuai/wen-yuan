import { prisma } from "@/server/db/prisma";
import { BookNotFoundError } from "@/server/modules/books/errors";

export class BookKnowledgePackRelationNotFoundError extends Error {
  readonly bookId: string;
  readonly packId: string;

  constructor(bookId: string, packId: string) {
    super("该书未挂载指定知识包");
    this.name = "BookKnowledgePackRelationNotFoundError";
    this.bookId = bookId;
    this.packId = packId;
  }
}

async function ensureBookExists(bookId: string) {
  const book = await prisma.book.findFirst({
    where : { id: bookId, deletedAt: null },
    select: { id: true, bookTypeId: true }
  });

  if (!book) {
    throw new BookNotFoundError(bookId);
  }

  return book;
}

function buildStatusCountMap(items: Array<{ packId: string; reviewStatus: string; _count: number }>) {
  const statusCountMap = new Map<string, Record<string, number>>();

  for (const item of items) {
    const current = statusCountMap.get(item.packId) ?? {};
    current[item.reviewStatus] = item._count;
    statusCountMap.set(item.packId, current);
  }

  return statusCountMap;
}

/**
 * 书籍 ↔ 知识包 关联管理服务。
 */

/** 获取书籍关联的知识包（含自动匹配的书籍类型包）。 */
export async function listBookKnowledgePacks(bookId: string) {
  const book = await ensureBookExists(bookId);

  // 手动挂载的包
  const mounted = await prisma.bookAliasPack.findMany({
    where  : { bookId },
    orderBy: { priority: "desc" },
    include: {
      pack: {
        include: {
          bookType: { select: { key: true, name: true } },
          _count  : { select: { entries: true } }
        }
      }
    }
  });

  // 自动继承的书籍类型包（排除已手动挂载的）
  let inherited: typeof mounted[number]["pack"][] = [];
  if (book.bookTypeId) {
    const mountedPackIds = mounted.map((m) => m.packId);
    inherited = await prisma.aliasPack.findMany({
      where: {
        bookTypeId: book.bookTypeId,
        scope     : "BOOK_TYPE",
        isActive  : true,
        id        : { notIn: mountedPackIds }
      },
      include: {
        bookType: { select: { key: true, name: true } },
        _count  : { select: { entries: true } }
      }
    });
  }

  const packIds = [...mounted.map((item) => item.packId), ...inherited.map((item) => item.id)];
  if (packIds.length === 0) {
    return { mounted, inherited };
  }

  const statusGroups = await prisma.aliasEntry.groupBy({
    by    : ["packId", "reviewStatus"],
    where : { packId: { in: packIds } },
    _count: true
  });
  const statusCountMap = buildStatusCountMap(statusGroups);

  return {
    mounted: mounted.map((item) => ({
      ...item,
      pack: {
        ...item.pack,
        statusCounts: statusCountMap.get(item.packId) ?? {}
      }
    })),
    inherited: inherited.map((item) => ({
      ...item,
      statusCounts: statusCountMap.get(item.id) ?? {}
    }))
  };
}

/** 挂载知识包到书籍。 */
export async function mountKnowledgePack(data: {
  bookId  : string;
  packId  : string;
  priority: number;
}) {
  await ensureBookExists(data.bookId);

  return prisma.bookAliasPack.upsert({
    where: {
      bookId_packId: {
        bookId: data.bookId,
        packId: data.packId
      }
    },
    update: { priority: data.priority },
    create: {
      bookId  : data.bookId,
      packId  : data.packId,
      priority: data.priority
    }
  });
}

/** 移除书籍知识包关联。 */
export async function unmountKnowledgePack(bookId: string, packId: string) {
  await ensureBookExists(bookId);

  const result = await prisma.bookAliasPack.deleteMany({
    where: { bookId, packId }
  });

  if (result.count === 0) {
    throw new BookKnowledgePackRelationNotFoundError(bookId, packId);
  }

  return result;
}

/** 更新关联优先级。 */
export async function updateBookKnowledgePackPriority(
  bookId: string,
  packId: string,
  priority: number
) {
  await ensureBookExists(bookId);

  const result = await prisma.bookAliasPack.updateMany({
    where: { bookId, packId },
    data : { priority }
  });

  if (result.count === 0) {
    throw new BookKnowledgePackRelationNotFoundError(bookId, packId);
  }

  return result;
}
