import { describe, expect, it, vi } from "vitest";

import type {
  StageBRepositoryClient,
  StageBRepositoryTransactionClient
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";
import { createStageBRepository } from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "33333333-3333-4333-8333-333333333333";

function createTransactionClient() {
  const entityMention = {
    findMany: vi.fn().mockResolvedValue([])
  };
  const chapter = {
    findMany: vi.fn().mockResolvedValue([])
  };
  const aliasClaim = {
    findMany: vi.fn().mockResolvedValue([])
  };
  const personaCandidate = {
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    create    : vi.fn().mockResolvedValue({ id: "candidate-1" })
  };

  const tx: StageBRepositoryTransactionClient = {
    entityMention,
    chapter,
    aliasClaim,
    personaCandidate
  };

  return { tx, entityMention, chapter, aliasClaim, personaCandidate };
}

describe("Stage B repository", () => {
  it("lists stage-b mentions for whole-book scope ordered by chapter no then createdAt", async () => {
    const { tx, entityMention, chapter } = createTransactionClient();
    entityMention.findMany.mockResolvedValueOnce([
      {
        id                 : "mention-1",
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID,
        runId              : RUN_ID,
        surfaceText        : "范进",
        mentionKind        : "NAMED",
        identityClaim      : "SELF",
        aliasTypeHint      : null,
        suspectedResolvesTo: null,
        evidenceSpanId     : "span-1",
        confidence         : 0.9,
        source             : "AI",
        createdAt          : new Date("2026-04-20T09:00:00.000Z")
      },
      {
        id                 : "mention-2",
        bookId             : BOOK_ID,
        chapterId          : "44444444-4444-4444-4444-444444444444",
        runId              : RUN_ID,
        surfaceText        : "周进",
        mentionKind        : "NAMED",
        identityClaim      : "SELF",
        aliasTypeHint      : null,
        suspectedResolvesTo: null,
        evidenceSpanId     : "span-2",
        confidence         : 0.8,
        source             : "RULE",
        createdAt          : new Date("2026-04-20T10:00:00.000Z")
      }
    ]);
    chapter.findMany.mockResolvedValueOnce([
      { id: CHAPTER_ID, no: 12 },
      { id: "44444444-4444-4444-4444-444444444444", no: 2 }
    ]);

    const repository = createStageBRepository(tx);
    const rows = await repository.listStageBMentions({ bookId: BOOK_ID, runId: RUN_ID });

    expect(entityMention.findMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID,
        source: { in: ["AI", "RULE"] }
      },
      orderBy: { createdAt: "asc" },
      select : {
        id                 : true,
        bookId             : true,
        chapterId          : true,
        runId              : true,
        surfaceText        : true,
        mentionKind        : true,
        identityClaim      : true,
        aliasTypeHint      : true,
        suspectedResolvesTo: true,
        evidenceSpanId     : true,
        confidence         : true,
        source             : true,
        createdAt          : true
      }
    });
    expect(chapter.findMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        id    : { in: [CHAPTER_ID, "44444444-4444-4444-4444-444444444444"] }
      },
      select : { id: true, no: true },
      orderBy: { no: "asc" }
    });
    expect(rows).toEqual([
      {
        id                 : "mention-2",
        bookId             : BOOK_ID,
        chapterId          : "44444444-4444-4444-4444-444444444444",
        chapterNo          : 2,
        runId              : RUN_ID,
        surfaceText        : "周进",
        mentionKind        : "NAMED",
        identityClaim      : "SELF",
        aliasTypeHint      : null,
        suspectedResolvesTo: null,
        evidenceSpanId     : "span-2",
        confidence         : 0.8,
        source             : "RULE"
      },
      {
        id                 : "mention-1",
        bookId             : BOOK_ID,
        chapterId          : CHAPTER_ID,
        chapterNo          : 12,
        runId              : RUN_ID,
        surfaceText        : "范进",
        mentionKind        : "NAMED",
        identityClaim      : "SELF",
        aliasTypeHint      : null,
        suspectedResolvesTo: null,
        evidenceSpanId     : "span-1",
        confidence         : 0.9,
        source             : "AI"
      }
    ]);
  });

  it("lists stage-b alias claims for whole-book scope with review note", async () => {
    const { tx, aliasClaim } = createTransactionClient();
    aliasClaim.findMany.mockResolvedValueOnce([
      {
        id             : "alias-1",
        bookId         : BOOK_ID,
        chapterId      : CHAPTER_ID,
        runId          : RUN_ID,
        aliasText      : "范老爷",
        aliasType      : "TITLE",
        claimKind      : "TITLE_OF",
        evidenceSpanIds: ["span-2"],
        confidence     : 0.8,
        reviewState    : "PENDING",
        source         : "RULE",
        reviewNote     : "KB_PENDING_HINT:knowledgeId=knowledge-1"
      }
    ]);

    const repository = createStageBRepository(tx);
    const rows = await repository.listStageBAliasClaims({ bookId: BOOK_ID, runId: RUN_ID });

    expect(aliasClaim.findMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID,
        source: { in: ["AI", "RULE"] }
      },
      orderBy: [{ chapterId: "asc" }, { createdAt: "asc" }],
      select : {
        id             : true,
        bookId         : true,
        chapterId      : true,
        runId          : true,
        aliasText      : true,
        aliasType      : true,
        claimKind      : true,
        evidenceSpanIds: true,
        confidence     : true,
        reviewState    : true,
        source         : true,
        reviewNote     : true
      }
    });
    expect(rows).toEqual([
      {
        id             : "alias-1",
        bookId         : BOOK_ID,
        chapterId      : CHAPTER_ID,
        runId          : RUN_ID,
        aliasText      : "范老爷",
        aliasType      : "TITLE",
        claimKind      : "TITLE_OF",
        evidenceSpanIds: ["span-2"],
        confidence     : 0.8,
        reviewState    : "PENDING",
        source         : "RULE",
        reviewNote     : "KB_PENDING_HINT:knowledgeId=knowledge-1"
      }
    ]);
  });

  it("clears persona candidates by bookId + runId", async () => {
    const { tx, personaCandidate } = createTransactionClient();
    const repository = createStageBRepository(tx);

    await repository.clearPersonaCandidatesForRun({ bookId: BOOK_ID, runId: RUN_ID });

    expect(personaCandidate.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID
      }
    });
  });

  it("creates persona candidate and returns id only", async () => {
    const { tx, personaCandidate } = createTransactionClient();
    const repository = createStageBRepository(tx);

    const created = await repository.createPersonaCandidate({
      bookId            : BOOK_ID,
      runId             : RUN_ID,
      candidateRef      : "candidate-ref-1",
      canonicalLabel    : "范进",
      candidateStatus   : "OPEN",
      firstSeenChapterNo: 1,
      lastSeenChapterNo : 10,
      mentionCount      : 4,
      evidenceScore     : 0.77
    });

    expect(personaCandidate.create).toHaveBeenCalledWith({
      data: {
        bookId            : BOOK_ID,
        runId             : RUN_ID,
        canonicalLabel    : "范进",
        candidateStatus   : "OPEN",
        firstSeenChapterNo: 1,
        lastSeenChapterNo : 10,
        mentionCount      : 4,
        evidenceScore     : 0.77
      },
      select: { id: true }
    });
    expect(created).toEqual({ id: "candidate-1" });
  });

  it("uses client transaction when available and injects tx-bound repository", async () => {
    const { tx, personaCandidate } = createTransactionClient();
    const transactionSpy = vi.fn(
      async (callback: (innerTx: StageBRepositoryTransactionClient) => Promise<unknown>) =>
        callback(tx)
    ) as StageBRepositoryClient["$transaction"];
    const client: StageBRepositoryClient = {
      ...tx,
      $transaction: transactionSpy
    };
    const repository = createStageBRepository(client);

    const result = await repository.transaction(async (txRepository) => {
      await txRepository.clearPersonaCandidatesForRun({ bookId: BOOK_ID, runId: RUN_ID });
      return "ok";
    });

    expect(transactionSpy).toHaveBeenCalledTimes(1);
    expect(personaCandidate.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID
      }
    });
    expect(result).toBe("ok");
  });

  it("falls back to direct execution when transaction API is absent", async () => {
    const { tx, personaCandidate } = createTransactionClient();
    const repository = createStageBRepository(tx);

    const result = await repository.transaction(async (currentRepository) => {
      await currentRepository.clearPersonaCandidatesForRun({ bookId: BOOK_ID, runId: RUN_ID });
      return "no-tx";
    });

    expect(personaCandidate.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId: BOOK_ID,
        runId : RUN_ID
      }
    });
    expect(result).toBe("no-tx");
  });
});
