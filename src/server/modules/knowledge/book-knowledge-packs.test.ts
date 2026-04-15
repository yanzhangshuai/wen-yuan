import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  BookKnowledgePackRelationNotFoundError,
  listBookKnowledgePacks,
  mountKnowledgePack,
  unmountKnowledgePack,
  updateBookKnowledgePackPriority
} from "@/server/modules/knowledge/book-knowledge-packs";
import { BookNotFoundError } from "@/server/modules/books/errors";

const hoisted = vi.hoisted(() => ({
  prisma: {
    book: {
      findFirst: vi.fn()
    },
    bookAliasPack: {
      findMany  : vi.fn(),
      upsert    : vi.fn(),
      deleteMany: vi.fn(),
      updateMany: vi.fn()
    },
    aliasPack: {
      findMany: vi.fn()
    },
    aliasEntry: {
      groupBy: vi.fn()
    }
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

describe("book-knowledge-packs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("throws when the target book does not exist", async () => {
    hoisted.prisma.book.findFirst.mockResolvedValueOnce(null);

    await expect(listBookKnowledgePacks("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  it("returns mounted and inherited packs with aggregated status counts", async () => {
    hoisted.prisma.book.findFirst.mockResolvedValueOnce({
      id        : "book-1",
      bookTypeId: "type-1"
    });
    hoisted.prisma.bookAliasPack.findMany.mockResolvedValueOnce([
      {
        bookId  : "book-1",
        packId  : "pack-mounted",
        priority: 9,
        pack    : {
          id      : "pack-mounted",
          name    : "手动包",
          bookType: { key: "classic", name: "章回小说" },
          _count  : { entries: 2 }
        }
      }
    ]);
    hoisted.prisma.aliasPack.findMany.mockResolvedValueOnce([
      {
        id      : "pack-inherited",
        name    : "继承包",
        bookType: { key: "classic", name: "章回小说" },
        _count  : { entries: 3 }
      }
    ]);
    hoisted.prisma.aliasEntry.groupBy.mockResolvedValueOnce([
      { packId: "pack-mounted", reviewStatus: "VERIFIED", _count: 2 },
      { packId: "pack-inherited", reviewStatus: "PENDING", _count: 1 }
    ]);

    await expect(listBookKnowledgePacks("book-1")).resolves.toEqual({
      mounted: [
        {
          bookId  : "book-1",
          packId  : "pack-mounted",
          priority: 9,
          pack    : {
            id          : "pack-mounted",
            name        : "手动包",
            bookType    : { key: "classic", name: "章回小说" },
            _count      : { entries: 2 },
            statusCounts: { VERIFIED: 2 }
          }
        }
      ],
      inherited: [
        {
          id          : "pack-inherited",
          name        : "继承包",
          bookType    : { key: "classic", name: "章回小说" },
          _count      : { entries: 3 },
          statusCounts: { PENDING: 1 }
        }
      ]
    });

    expect(hoisted.prisma.aliasPack.findMany).toHaveBeenCalledWith({
      where: {
        bookTypeId: "type-1",
        scope     : "BOOK_TYPE",
        isActive  : true,
        id        : { notIn: ["pack-mounted"] }
      },
      include: {
        bookType: { select: { key: true, name: true } },
        _count  : { select: { entries: true } }
      }
    });
  });

  it("short-circuits status aggregation when the book has no mounted or inherited packs", async () => {
    hoisted.prisma.book.findFirst.mockResolvedValueOnce({
      id        : "book-1",
      bookTypeId: null
    });
    hoisted.prisma.bookAliasPack.findMany.mockResolvedValueOnce([]);

    await expect(listBookKnowledgePacks("book-1")).resolves.toEqual({
      mounted  : [],
      inherited: []
    });

    expect(hoisted.prisma.aliasPack.findMany).not.toHaveBeenCalled();
    expect(hoisted.prisma.aliasEntry.groupBy).not.toHaveBeenCalled();
  });

  it("upserts mounted relations after validating the book exists", async () => {
    hoisted.prisma.book.findFirst.mockResolvedValueOnce({
      id        : "book-1",
      bookTypeId: "type-1"
    });
    hoisted.prisma.bookAliasPack.upsert.mockResolvedValueOnce({
      bookId  : "book-1",
      packId  : "pack-1",
      priority: 7
    });

    await expect(mountKnowledgePack({
      bookId  : "book-1",
      packId  : "pack-1",
      priority: 7
    })).resolves.toEqual({
      bookId  : "book-1",
      packId  : "pack-1",
      priority: 7
    });

    expect(hoisted.prisma.bookAliasPack.upsert).toHaveBeenCalledWith({
      where: {
        bookId_packId: {
          bookId: "book-1",
          packId: "pack-1"
        }
      },
      update: { priority: 7 },
      create: {
        bookId  : "book-1",
        packId  : "pack-1",
        priority: 7
      }
    });
  });

  it("raises relation-not-found errors for missing unmount or priority updates", async () => {
    hoisted.prisma.book.findFirst
      .mockResolvedValueOnce({ id: "book-1", bookTypeId: null })
      .mockResolvedValueOnce({ id: "book-1", bookTypeId: null })
      .mockResolvedValueOnce({ id: "book-1", bookTypeId: null })
      .mockResolvedValueOnce({ id: "book-1", bookTypeId: null });
    hoisted.prisma.bookAliasPack.deleteMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });
    hoisted.prisma.bookAliasPack.updateMany
      .mockResolvedValueOnce({ count: 0 })
      .mockResolvedValueOnce({ count: 1 });

    await expect(unmountKnowledgePack("book-1", "missing-pack")).rejects.toBeInstanceOf(
      BookKnowledgePackRelationNotFoundError
    );
    await expect(unmountKnowledgePack("book-1", "pack-1")).resolves.toEqual({ count: 1 });
    await expect(updateBookKnowledgePackPriority("book-1", "missing-pack", 5)).rejects.toBeInstanceOf(
      BookKnowledgePackRelationNotFoundError
    );
    await expect(updateBookKnowledgePackPriority("book-1", "pack-1", 5)).resolves.toEqual({ count: 1 });
  });
});
