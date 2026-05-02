import { describe, expect, it, vi } from "vitest";

import { ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { createUpdateRelationshipEventService } from "@/server/modules/relationships/updateRelationshipEvent";
import {
  RelationshipEventNotFoundError,
  RelationshipInputError
} from "@/server/modules/relationships/errors";

function createTransactionMock(tx: unknown) {
  return vi.fn().mockImplementation(async (callback: (transactionClient: unknown) => unknown) => callback(tx));
}

describe("updateRelationshipEvent service", () => {
  it("updates editable event fields and normalizes tags", async () => {
    const eventUpdate = vi.fn().mockResolvedValue({
      id            : "event-1",
      relationshipId: "rel-1",
      bookId        : "book-1",
      chapterId     : "chapter-1",
      chapterNo     : 5,
      sourceId      : "persona-a",
      targetId      : "persona-b",
      summary       : "二人修好",
      evidence      : null,
      attitudeTags  : ["修好", "公开"],
      paraIndex     : null,
      confidence    : 0.9,
      recordSource  : RecordSource.MANUAL,
      status        : ProcessingStatus.VERIFIED,
      createdAt     : new Date("2026-03-24T00:00:00.000Z"),
      updatedAt     : new Date("2026-03-25T00:00:00.000Z")
    });
    const service = createUpdateRelationshipEventService({
      $transaction: createTransactionMock({
        relationshipEvent: {
          findFirst: vi.fn().mockResolvedValue({ id: "event-1", bookId: "book-1" }),
          update   : eventUpdate
        }
      })
    } as never);

    const result = await service.updateRelationshipEvent("event-1", {
      summary     : " 二人修好 ",
      evidence    : "",
      attitudeTags: ["修好", "公开", "修好"],
      paraIndex   : null,
      confidence  : 0.9,
      status      : ProcessingStatus.VERIFIED
    });

    expect(eventUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: {
        summary     : "二人修好",
        evidence    : null,
        attitudeTags: ["修好", "公开"],
        paraIndex   : null,
        confidence  : 0.9,
        status      : ProcessingStatus.VERIFIED
      }
    }));
    expect(result.updatedAt).toBe("2026-03-25T00:00:00.000Z");
  });

  it("updates chapterNo when chapterId changes", async () => {
    const eventUpdate = vi.fn().mockResolvedValue({
      id            : "event-1", relationshipId: "rel-1", bookId        : "book-1", chapterId     : "chapter-2", chapterNo     : 8,
      sourceId      : "persona-a", targetId      : "persona-b", summary       : "拜访", evidence      : null, attitudeTags  : [],
      paraIndex     : null, confidence    : 0.8, recordSource  : RecordSource.MANUAL, status        : ProcessingStatus.VERIFIED,
      createdAt     : new Date("2026-03-24T00:00:00.000Z"), updatedAt     : new Date("2026-03-25T00:00:00.000Z")
    });
    const tx = {
      relationshipEvent: {
        findFirst: vi.fn().mockResolvedValue({ id: "event-1", bookId: "book-1" }),
        update   : eventUpdate
      },
      chapter: {
        findFirst: vi.fn().mockResolvedValue({ id: "chapter-2", no: 8 })
      }
    };
    const service = createUpdateRelationshipEventService({ $transaction: createTransactionMock(tx) } as never);

    await service.updateRelationshipEvent("event-1", { chapterId: "chapter-2" });

    expect(tx.chapter.findFirst).toHaveBeenCalledWith({
      where : { id: "chapter-2", bookId: "book-1" },
      select: { id: true, no: true }
    });
    expect(eventUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: { chapterId: "chapter-2", chapterNo: 8 }
    }));
  });

  it("throws not found when event is missing", async () => {
    const service = createUpdateRelationshipEventService({
      $transaction: createTransactionMock({
        relationshipEvent: { findFirst: vi.fn().mockResolvedValue(null) }
      })
    } as never);

    await expect(service.updateRelationshipEvent("event-missing", {
      summary: "事件摘要"
    })).rejects.toBeInstanceOf(RelationshipEventNotFoundError);
  });

  it("rejects empty patch payloads", async () => {
    const service = createUpdateRelationshipEventService({ $transaction: vi.fn() } as never);

    await expect(service.updateRelationshipEvent("event-1", {}))
      .rejects.toBeInstanceOf(RelationshipInputError);
  });
});
