import { describe, expect, it, vi } from "vitest";

import { BioCategory, ProcessingStatus, RecordSource } from "@/generated/prisma/enums";
import { BiographyInputError } from "@/server/modules/biography/errors";
import {
  createChapterEventsWorkbenchService,
  type ChapterEventsWorkbenchPrisma
} from "@/server/modules/roleWorkbench/chapterEvents";

function createService(overrides: Partial<ChapterEventsWorkbenchPrisma> = {}) {
  const mocks = {
    bookFindFirst                     : vi.fn().mockResolvedValue({ id: "book-1" }),
    chapterFindMany                   : vi.fn(),
    chapterFindFirst                  : vi.fn(),
    biographyGroupBy                  : vi.fn(),
    biographyFindMany                 : vi.fn(),
    biographyCount                    : vi.fn(),
    biographyCreate                   : vi.fn(),
    biographyFindFirst                : vi.fn(),
    biographyUpdate                   : vi.fn(),
    profileFindFirst                  : vi.fn(),
    chapterBiographyVerificationFind  : vi.fn(),
    chapterBiographyVerificationUpsert: vi.fn()
  };
  const tx = {
    book: {
      findFirst: mocks.bookFindFirst
    },
    chapter: {
      findMany : mocks.chapterFindMany,
      findFirst: mocks.chapterFindFirst
    },
    biographyRecord: {
      groupBy  : mocks.biographyGroupBy,
      findMany : mocks.biographyFindMany,
      count    : mocks.biographyCount,
      create   : mocks.biographyCreate,
      findFirst: mocks.biographyFindFirst,
      update   : mocks.biographyUpdate
    },
    profile: {
      findFirst: mocks.profileFindFirst
    },
    chapterBiographyVerification: {
      findMany: mocks.chapterBiographyVerificationFind,
      upsert  : mocks.chapterBiographyVerificationUpsert
    },
    ...overrides
  } as unknown as ChapterEventsWorkbenchPrisma;

  const prisma = {
    ...tx,
    $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx))
  } as unknown as ChapterEventsWorkbenchPrisma;

  return {
    mocks,
    tx,
    service: createChapterEventsWorkbenchService(prisma)
  };
}

describe("chapterEvents workbench service", () => {
  it("lists chapters with event counts, pending counts, and verification state", async () => {
    const { mocks, service } = createService();
    mocks.chapterFindMany.mockResolvedValueOnce([
      { id: "chapter-1", no: 1, noText: "第一回", title: "楔子" },
      { id: "chapter-2", no: 2, noText: null, title: "正传" }
    ] as never);
    mocks.biographyGroupBy
      .mockResolvedValueOnce([
        { chapterId: "chapter-1", _count: { _all: 2 } },
        { chapterId: "chapter-2", _count: { _all: 1 } }
      ] as never)
      .mockResolvedValueOnce([
        { chapterId: "chapter-1", _count: { _all: 1 } }
      ] as never);
    mocks.chapterBiographyVerificationFind.mockResolvedValueOnce([
      { chapterId: "chapter-2", verifiedAt: new Date("2026-04-28T10:00:00.000Z") }
    ] as never);

    const result = await service.listChapterSummaries("book-1");

    expect(result.summary).toEqual({ totalChapters: 2, verifiedChapters: 1, pendingEvents: 1 });
    expect(result.chapters).toEqual([
      {
        id          : "chapter-1",
        no          : 1,
        noText      : "第一回",
        title       : "楔子",
        eventCount  : 2,
        pendingCount: 1,
        isVerified  : false,
        verifiedAt  : null
      },
      {
        id          : "chapter-2",
        no          : 2,
        noText      : null,
        title       : "正传",
        eventCount  : 1,
        pendingCount: 0,
        isVerified  : true,
        verifiedAt  : "2026-04-28T10:00:00.000Z"
      }
    ]);
  });

  it("blocks chapter verification while draft biography records remain", async () => {
    const { mocks, service } = createService();
    mocks.chapterFindFirst.mockResolvedValueOnce({ id: "chapter-1", bookId: "book-1" });
    mocks.biographyCount.mockResolvedValueOnce(1);

    await expect(service.markChapterVerified("book-1", "chapter-1")).rejects.toThrow(BiographyInputError);
    expect(mocks.chapterBiographyVerificationUpsert).not.toHaveBeenCalled();
  });

  it("creates manual chapter events as verified records and rejects cross-book personas", async () => {
    const { mocks, service } = createService();
    mocks.profileFindFirst.mockResolvedValueOnce(null);

    await expect(service.createManualEvent("book-1", {
      personaId: "persona-2",
      chapterId: "chapter-1",
      category : BioCategory.EVENT,
      event    : "误入他书"
    })).rejects.toThrow(BiographyInputError);

    mocks.profileFindFirst.mockResolvedValueOnce({ personaId: "persona-1" });
    mocks.chapterFindFirst.mockResolvedValueOnce({ id: "chapter-1", no: 7 });
    mocks.biographyCreate.mockResolvedValueOnce({
      id          : "bio-1",
      personaId   : "persona-1",
      chapterId   : "chapter-1",
      chapterNo   : 7,
      category    : BioCategory.EVENT,
      title       : null,
      location    : null,
      event       : "人工补录",
      virtualYear : null,
      tags        : ["放牧", "谋生"],
      ironyNote   : "备注",
      recordSource: RecordSource.MANUAL,
      status      : ProcessingStatus.VERIFIED,
      createdAt   : new Date("2026-04-28T10:00:00.000Z"),
      persona     : { name: "范进" }
    });

    const created = await service.createManualEvent("book-1", {
      personaId: "persona-1",
      chapterId: "chapter-1",
      category : BioCategory.EVENT,
      event    : "人工补录",
      tags     : [" 放牧 ", "谋生", "", "放牧"],
      ironyNote: "备注"
    });

    expect(mocks.biographyCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        recordSource: RecordSource.MANUAL,
        status      : ProcessingStatus.VERIFIED,
        chapterNo   : 7,
        tags        : ["放牧", "谋生"]
      })
    }));
    expect(created.status).toBe(ProcessingStatus.VERIFIED);
    expect(created.personaName).toBe("范进");
  });

  it("updates event persona and chapter while maintaining redundant chapter number", async () => {
    const { mocks, service } = createService();
    mocks.biographyFindFirst.mockResolvedValueOnce({
      id     : "bio-1",
      chapter: { bookId: "book-1" }
    });
    mocks.profileFindFirst.mockResolvedValueOnce({ personaId: "persona-2" });
    mocks.chapterFindFirst.mockResolvedValueOnce({ id: "chapter-2", no: 9 });
    mocks.biographyUpdate.mockResolvedValueOnce({
      id          : "bio-1",
      personaId   : "persona-2",
      chapterId   : "chapter-2",
      chapterNo   : 9,
      category    : BioCategory.CAREER,
      title       : "知县",
      location    : "南京",
      event       : "调任",
      virtualYear : "某年",
      tags        : ["任职"],
      ironyNote   : null,
      recordSource: RecordSource.AI,
      status      : ProcessingStatus.VERIFIED,
      updatedAt   : new Date("2026-04-28T11:00:00.000Z"),
      persona     : { name: "周进" }
    });

    await service.updateEvent("book-1", "bio-1", {
      personaId: "persona-2",
      chapterId: "chapter-2",
      category : BioCategory.CAREER,
      title    : "知县",
      location : "南京",
      event    : "调任",
      tags     : ["任职", "任职", " 调任 "]
    });

    expect(mocks.biographyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        personaId: "persona-2",
        chapterId: "chapter-2",
        chapterNo: 9,
        tags     : ["任职", "调任"]
      })
    }));
  });

  it("soft-deletes chapter events as rejected records", async () => {
    const { mocks, service } = createService();
    mocks.biographyFindFirst.mockResolvedValueOnce({
      id     : "bio-1",
      chapter: { bookId: "book-1" }
    });
    mocks.biographyUpdate.mockResolvedValueOnce({ id: "bio-1" });

    const result = await service.deleteEvent("book-1", "bio-1");

    expect(result).toEqual({ id: "bio-1" });
    expect(mocks.biographyUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "bio-1" },
      data : expect.objectContaining({
        status   : ProcessingStatus.REJECTED,
        deletedAt: expect.any(Date)
      })
    }));
  });
});
