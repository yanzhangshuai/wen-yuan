import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  approveUnknownRelationshipTypeDraft,
  buildUnknownRelationshipTypeSignature,
  listUnknownRelationshipTypeDrafts,
  mergeUnknownRelationshipTypeDraft,
  recordUnknownRelationshipTypeOccurrence,
  rejectUnknownRelationshipTypeDraft
} from "@/server/modules/knowledge/unknown-relationship-types";

const hoisted = vi.hoisted(() => ({
  createRelationshipType: vi.fn(),
  prisma                : {
    relationshipTypeDefinition: {
      findFirst: vi.fn()
    },
    unknownRelationshipTypeDraft: {
      findMany  : vi.fn(),
      findUnique: vi.fn(),
      update    : vi.fn()
    }
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

vi.mock("@/server/modules/knowledge/relationship-types", () => ({
  createRelationshipType: hoisted.createRelationshipType
}));

function createTransactionMock() {
  return {
    unknownRelationshipTypeDraft: {
      findFirst: vi.fn(),
      create   : vi.fn(),
      update   : vi.fn()
    },
    unknownRelationshipTypeOccurrence: {
      findFirst: vi.fn(),
      create   : vi.fn()
    }
  };
}

function buildDraft(overrides: Record<string, unknown> = {}) {
  return {
    id                     : "draft-1",
    bookId                 : "book-1",
    firstChapterId         : "chapter-1",
    firstJobId             : "job-1",
    signature              : "师徒|INVERSE|师父|徒弟",
    proposedName           : "师徒",
    proposedGroup          : "身份",
    proposedDirectionMode  : "INVERSE",
    proposedSourceRoleLabel: "师父",
    proposedTargetRoleLabel: "徒弟",
    occurrenceCount        : 2,
    status                 : "PENDING",
    rejectionReason        : null,
    approvedTypeCode       : null,
    mergedIntoDraftId      : null,
    createdAt              : new Date("2026-05-04T00:00:00.000Z"),
    updatedAt              : new Date("2026-05-04T00:00:00.000Z"),
    book                   : {
      id        : "book-1",
      title     : "儒林外史",
      bookTypeId: "book-type-1",
      bookType  : { id: "book-type-1", key: "classic", name: "章回小说" }
    },
    firstChapter: { id: "chapter-1", no: 1, title: "第一回" },
    occurrences : [{
      id             : "occurrence-1",
      draftId        : "draft-1",
      bookId         : "book-1",
      chapterId      : "chapter-1",
      jobId          : "job-1",
      sourceName     : "张三",
      targetName     : "李四",
      sourcePersonaId: "persona-source",
      targetPersonaId: "persona-target",
      evidence       : "张三收李四为徒",
      createdAt      : new Date("2026-05-04T00:00:00.000Z"),
      chapter        : { id: "chapter-1", no: 1, title: "第一回" }
    }],
    mergedIntoDraft: null,
    ...overrides
  };
}

describe("unknown relationship types", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("normalizes signatures from proposed relationship semantics", () => {
    expect(buildUnknownRelationshipTypeSignature({
      proposedName           : " 师   徒 ",
      proposedDirectionMode  : "INVERSE",
      proposedSourceRoleLabel: " 师父 ",
      proposedTargetRoleLabel: "徒弟"
    })).toBe("师 徒|INVERSE|师父|徒弟");
  });

  it("creates a draft and first occurrence for a new unknown proposal", async () => {
    const tx = createTransactionMock();
    tx.unknownRelationshipTypeDraft.findFirst.mockResolvedValueOnce(null);
    tx.unknownRelationshipTypeDraft.create.mockResolvedValueOnce({ id: "draft-1" });
    tx.unknownRelationshipTypeOccurrence.findFirst.mockResolvedValueOnce(null);

    await expect(recordUnknownRelationshipTypeOccurrence(tx as never, {
      bookId         : "book-1",
      chapterId      : "chapter-1",
      jobId          : "job-1",
      sourceName     : "张三",
      targetName     : "李四",
      sourcePersonaId: "persona-source",
      targetPersonaId: "persona-target",
      proposal       : {
        proposedName           : " 师徒 ",
        proposedGroup          : "身份",
        proposedDirectionMode  : "INVERSE",
        proposedSourceRoleLabel: "师父",
        proposedTargetRoleLabel: "徒弟",
        evidence               : "提案证据"
      },
      evidence: "张三收李四为徒"
    })).resolves.toBe(true);

    expect(tx.unknownRelationshipTypeDraft.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        bookId                 : "book-1",
        firstChapterId         : "chapter-1",
        firstJobId             : "job-1",
        proposedName           : "师徒",
        proposedDirectionMode  : "INVERSE",
        proposedSourceRoleLabel: "师父",
        proposedTargetRoleLabel: "徒弟",
        occurrenceCount        : 1
      }),
      select: { id: true }
    });
    expect(tx.unknownRelationshipTypeOccurrence.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        draftId        : "draft-1",
        sourcePersonaId: "persona-source",
        targetPersonaId: "persona-target",
        evidence       : "张三收李四为徒"
      })
    });
    expect(tx.unknownRelationshipTypeDraft.update).not.toHaveBeenCalled();
  });

  it("increments an existing draft only when a new occurrence is added", async () => {
    const tx = createTransactionMock();
    tx.unknownRelationshipTypeDraft.findFirst.mockResolvedValue({ id: "draft-1" });
    tx.unknownRelationshipTypeOccurrence.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "occurrence-1" });

    const input = {
      bookId    : "book-1",
      chapterId : "chapter-2",
      sourceName: "张三",
      targetName: "李四",
      proposal  : {
        proposedName         : "同门",
        proposedGroup        : "师承",
        proposedDirectionMode: "SYMMETRIC" as const
      }
    };

    await expect(recordUnknownRelationshipTypeOccurrence(tx as never, input)).resolves.toBe(true);
    await expect(recordUnknownRelationshipTypeOccurrence(tx as never, input)).resolves.toBe(false);

    expect(tx.unknownRelationshipTypeOccurrence.create).toHaveBeenCalledTimes(1);
    expect(tx.unknownRelationshipTypeDraft.update).toHaveBeenCalledTimes(1);
    expect(tx.unknownRelationshipTypeDraft.update).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data : { occurrenceCount: { increment: 1 } }
    });
  });

  it("lists drafts with review context ordered by occurrence count", async () => {
    hoisted.prisma.unknownRelationshipTypeDraft.findMany.mockResolvedValueOnce([buildDraft()]);

    await expect(listUnknownRelationshipTypeDrafts({ bookId: "book-1", status: "PENDING" })).resolves.toHaveLength(1);

    expect(hoisted.prisma.unknownRelationshipTypeDraft.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where  : { bookId: "book-1", status: "PENDING" },
      orderBy: [{ occurrenceCount: "desc" }, { updatedAt: "desc" }],
      include: expect.objectContaining({
        book           : expect.any(Object),
        firstChapter   : expect.any(Object),
        occurrences    : expect.any(Object),
        mergedIntoDraft: expect.any(Object)
      })
    }));
  });

  it("approves drafts by binding an existing active relationship type", async () => {
    const updatedDraft = buildDraft({ status: "APPROVED", approvedTypeCode: "relationship_known" });
    hoisted.prisma.unknownRelationshipTypeDraft.findUnique
      .mockResolvedValueOnce({ id: "draft-1", status: "PENDING" })
      .mockResolvedValueOnce(updatedDraft);
    hoisted.prisma.relationshipTypeDefinition.findFirst.mockResolvedValueOnce({ code: "relationship_known" });

    await expect(approveUnknownRelationshipTypeDraft("draft-1", {
      mode                : "BIND_EXISTING",
      relationshipTypeCode: "relationship_known"
    })).resolves.toEqual(updatedDraft);

    expect(hoisted.prisma.unknownRelationshipTypeDraft.update).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data : { status: "APPROVED", approvedTypeCode: "relationship_known" }
    });
    expect(hoisted.createRelationshipType).not.toHaveBeenCalled();
  });

  it("approves drafts by creating a new relationship type", async () => {
    const updatedDraft = buildDraft({ status: "APPROVED", approvedTypeCode: "relationship_new" });
    hoisted.prisma.unknownRelationshipTypeDraft.findUnique
      .mockResolvedValueOnce({ id: "draft-1", status: "PENDING" })
      .mockResolvedValueOnce(updatedDraft);
    hoisted.createRelationshipType.mockResolvedValueOnce({ code: "relationship_new" });

    await expect(approveUnknownRelationshipTypeDraft("draft-1", {
      mode : "CREATE_NEW",
      input: {
        name         : "师徒",
        group        : "身份",
        directionMode: "INVERSE",
        edgeLabel    : "师徒"
      }
    })).resolves.toEqual(updatedDraft);

    expect(hoisted.createRelationshipType).toHaveBeenCalledWith(expect.objectContaining({ name: "师徒" }));
    expect(hoisted.prisma.unknownRelationshipTypeDraft.update).toHaveBeenCalledWith({
      where: { id: "draft-1" },
      data : { status: "APPROVED", approvedTypeCode: "relationship_new" }
    });
  });

  it("rejects and merges drafts without touching relationship type definitions", async () => {
    const rejectedDraft = buildDraft({ status: "REJECTED", rejectionReason: "证据不足" });
    const mergedDraft = buildDraft({ status: "MERGED", mergedIntoDraftId: "draft-target" });
    hoisted.prisma.unknownRelationshipTypeDraft.findUnique
      .mockResolvedValueOnce(rejectedDraft)
      .mockResolvedValueOnce({ id: "draft-target" })
      .mockResolvedValueOnce(mergedDraft);

    await expect(rejectUnknownRelationshipTypeDraft("draft-1", "  证据不足  ")).resolves.toEqual(rejectedDraft);
    await expect(mergeUnknownRelationshipTypeDraft("draft-1", "draft-target")).resolves.toEqual(mergedDraft);

    expect(hoisted.prisma.unknownRelationshipTypeDraft.update).toHaveBeenNthCalledWith(1, {
      where: { id: "draft-1" },
      data : { status: "REJECTED", rejectionReason: "证据不足" }
    });
    expect(hoisted.prisma.unknownRelationshipTypeDraft.update).toHaveBeenNthCalledWith(2, {
      where: { id: "draft-1" },
      data : { status: "MERGED", mergedIntoDraftId: "draft-target" }
    });
    expect(hoisted.createRelationshipType).not.toHaveBeenCalled();
  });

  it("rejects invalid approve and merge operations", async () => {
    hoisted.prisma.unknownRelationshipTypeDraft.findUnique
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "draft-1", status: "PENDING" })
      .mockResolvedValueOnce(null);
    hoisted.prisma.relationshipTypeDefinition.findFirst.mockResolvedValueOnce(null);

    await expect(approveUnknownRelationshipTypeDraft("missing", {
      mode                : "BIND_EXISTING",
      relationshipTypeCode: "relationship_known"
    })).rejects.toThrow("未知关系类型草稿不存在");
    await expect(approveUnknownRelationshipTypeDraft("draft-1", {
      mode                : "BIND_EXISTING",
      relationshipTypeCode: "relationship_missing"
    })).rejects.toThrow("关系类型不存在或未启用");
    await expect(mergeUnknownRelationshipTypeDraft("draft-1", "draft-1")).rejects.toThrow("不能合并到自身");
    await expect(mergeUnknownRelationshipTypeDraft("draft-1", "draft-target")).rejects.toThrow("目标草稿不存在");
  });
});
