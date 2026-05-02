import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createCreateRelationshipEventService } from "@/server/modules/relationships/createRelationshipEvent";
import {
  RelationshipInputError,
  RelationshipNotFoundError
} from "@/server/modules/relationships/errors";

function createTransactionMock(tx: unknown) {
  return vi.fn().mockImplementation(async (callback: (transactionClient: unknown) => unknown) => callback(tx));
}

describe("createRelationshipEvent service", () => {
  it("creates a manual verified event under an active relationship", async () => {
    const relationshipEventCreate = vi.fn().mockResolvedValue({
      id            : "event-1",
      relationshipId: "rel-1",
      bookId        : "book-1",
      chapterId     : "chapter-1",
      chapterNo     : 3,
      sourceId      : "persona-a",
      targetId      : "persona-b",
      summary       : "张三提携李四",
      evidence      : "原文证据",
      attitudeTags  : ["资助", "提携"],
      paraIndex     : 12,
      confidence    : 0.8,
      recordSource  : RecordSource.MANUAL,
      status        : ProcessingStatus.VERIFIED,
      createdAt     : new Date("2026-03-25T00:00:00.000Z"),
      updatedAt     : new Date("2026-03-25T00:00:00.000Z")
    });
    const tx = {
      relationship: {
        findFirst: vi.fn().mockResolvedValue({
          id      : "rel-1",
          bookId  : "book-1",
          sourceId: "persona-a",
          targetId: "persona-b"
        })
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-1", no: 3 })
      },
      relationshipEvent: {
        create: relationshipEventCreate
      }
    };
    const service = createCreateRelationshipEventService({ $transaction: createTransactionMock(tx) } as never);

    const result = await service.createRelationshipEvent("rel-1", {
      chapterId   : "chapter-1",
      summary     : " 张三提携李四 ",
      evidence    : " 原文证据 ",
      attitudeTags: ["资助", " ", "提携", "资助"],
      paraIndex   : 12,
      confidence  : 0.8
    });

    expect(relationshipEventCreate).toHaveBeenCalledWith({
      data: {
        relationshipId: "rel-1",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        chapterNo     : 3,
        sourceId      : "persona-a",
        targetId      : "persona-b",
        summary       : "张三提携李四",
        evidence      : "原文证据",
        attitudeTags  : ["资助", "提携"],
        paraIndex     : 12,
        confidence    : 0.8,
        recordSource  : RecordSource.MANUAL,
        status        : ProcessingStatus.VERIFIED
      },
      select: expect.any(Object)
    });
    expect(result).toEqual(expect.objectContaining({
      id          : "event-1",
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED,
      createdAt   : "2026-03-25T00:00:00.000Z"
    }));
  });

  it("throws not found when relationship is missing or soft-deleted", async () => {
    const service = createCreateRelationshipEventService({
      $transaction: createTransactionMock({
        relationship: { findFirst: vi.fn().mockResolvedValue(null) }
      })
    } as never);

    await expect(service.createRelationshipEvent("rel-missing", {
      chapterId: "chapter-1",
      summary  : "事件摘要"
    })).rejects.toBeInstanceOf(RelationshipNotFoundError);
  });

  it("rejects a chapter outside the relationship book", async () => {
    const service = createCreateRelationshipEventService({
      $transaction: createTransactionMock({
        relationship: {
          findFirst: vi.fn().mockResolvedValue({
            id: "rel-1", bookId: "book-1", sourceId: "persona-a", targetId: "persona-b"
          })
        },
        chapter: {
          findFirst: vi.fn().mockResolvedValue(null)
        }
      })
    } as never);

    await expect(service.createRelationshipEvent("rel-1", {
      chapterId: "chapter-x",
      summary  : "事件摘要"
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });

  it("rejects blank summaries", async () => {
    const service = createCreateRelationshipEventService({ $transaction: vi.fn() } as never);

    await expect(service.createRelationshipEvent("rel-1", {
      chapterId: "chapter-1",
      summary  : "   "
    })).rejects.toBeInstanceOf(RelationshipInputError);
  });
});
