import { describe, expect, it, vi } from "vitest";

import type {
  StageCRepositoryClient,
  StageCRepositoryTransactionClient
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/repository";
import { createStageCRepository } from "@/server/modules/analysis/pipelines/evidence-review/stageC/repository";

const BOOK_ID = "book-1";
const RUN_ID = "run-1";
const CHAPTER_ID_1 = "chapter-1";
const CHAPTER_ID_2 = "chapter-2";
const EVENT_ID_1 = "event-1";
const CANDIDATE_ID_1 = "candidate-1";

function createRepositoryClient() {
  const eventClaimFindMany = vi.fn().mockResolvedValue([
    {
      id                       : EVENT_ID_1,
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID_2,
      runId                    : RUN_ID,
      subjectMentionId         : "mention-1",
      subjectPersonaCandidateId: CANDIDATE_ID_1,
      predicate                : "赴宴",
      objectText               : null,
      objectPersonaCandidateId : null,
      locationText             : "北京",
      timeHintId               : "time-1",
      eventCategory            : "EVENT",
      narrativeLens            : "SELF",
      evidenceSpanIds          : ["evidence-1"],
      confidence               : 0.72,
      reviewState              : "PENDING",
      source                   : "AI",
      derivedFromClaimId       : null,
      reviewNote               : null,
      createdAt                : new Date("2026-04-20T00:00:00.000Z")
    }
  ]);

  const tx: StageCRepositoryTransactionClient = {
    chapter: {
      findMany: vi.fn().mockResolvedValue([
        { id: CHAPTER_ID_1, no: 10 },
        { id: CHAPTER_ID_2, no: 12 }
      ])
    },
    personaCandidate: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                : CANDIDATE_ID_1,
          bookId            : BOOK_ID,
          runId             : RUN_ID,
          canonicalLabel    : "范进",
          firstSeenChapterNo: 1,
          lastSeenChapterNo : 20,
          mentionCount      : 14,
          evidenceScore     : 0.92
        }
      ])
    },
    eventClaim: {
      findMany: eventClaimFindMany
    },
    relationClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                      : "relation-1",
          bookId                  : BOOK_ID,
          chapterId               : CHAPTER_ID_2,
          runId                   : RUN_ID,
          sourceMentionId         : "mention-1",
          targetMentionId         : "mention-2",
          sourcePersonaCandidateId: CANDIDATE_ID_1,
          targetPersonaCandidateId: "candidate-2",
          relationTypeKey         : "teacher_of",
          relationLabel           : "师生",
          relationTypeSource      : "PRESET",
          direction               : "FORWARD",
          effectiveChapterStart   : 12,
          effectiveChapterEnd     : null,
          timeHintId              : null,
          evidenceSpanIds         : ["evidence-2"],
          confidence              : 0.8,
          reviewState             : "PENDING",
          source                  : "AI",
          derivedFromClaimId      : null,
          reviewNote              : null,
          createdAt               : new Date("2026-04-20T00:00:01.000Z")
        }
      ])
    },
    timeClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                 : "time-1",
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID_1,
          runId              : RUN_ID,
          rawTimeText        : "次日",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "次日",
          relativeOrderWeight: 2,
          chapterRangeStart  : 11,
          chapterRangeEnd    : 11,
          evidenceSpanIds    : ["evidence-3"],
          confidence         : 0.61,
          reviewState        : "PENDING",
          source             : "AI",
          derivedFromClaimId : null,
          reviewNote         : null,
          createdAt          : new Date("2026-04-20T00:00:02.000Z")
        }
      ])
    },
    conflictFlag: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                        : "conflict-1",
          bookId                    : BOOK_ID,
          chapterId                 : CHAPTER_ID_2,
          runId                     : RUN_ID,
          conflictType              : "ALIAS_CONFLICT",
          severity                  : "HIGH",
          relatedClaimKind          : "EVENT",
          relatedClaimIds           : [EVENT_ID_1],
          relatedPersonaCandidateIds: [CANDIDATE_ID_1],
          relatedChapterIds         : [CHAPTER_ID_2],
          evidenceSpanIds           : ["evidence-1"],
          reviewState               : "CONFLICTED",
          source                    : "RULE",
          createdAt                 : new Date("2026-04-20T00:00:03.000Z")
        }
      ])
    }
  };

  const client: StageCRepositoryClient = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (inner: StageCRepositoryTransactionClient) => Promise<unknown>) => callback(tx)
    ) as StageCRepositoryClient["$transaction"]
  };

  return { client, eventClaimFindMany };
}

describe("stageC/repository", () => {
  it("loads root claims only and maps chapter numbers", async () => {
    const { client, eventClaimFindMany } = createRepositoryClient();
    const repository = createStageCRepository(client);

    const payload = await repository.loadFactAttributionInputs({ bookId: BOOK_ID, runId: RUN_ID });

    expect(payload.eventClaims[0]?.chapterNo).toBe(12);
    expect(payload.timeClaims[0]?.chapterNo).toBe(10);
    expect(eventClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId            : BOOK_ID,
        runId             : RUN_ID,
        source            : { in: ["AI", "RULE"] },
        derivedFromClaimId: null
      })
    }));
  });

  it("loads conflict flags for ranking context", async () => {
    const { client } = createRepositoryClient();
    const repository = createStageCRepository(client);

    const payload = await repository.loadFactAttributionInputs({ bookId: BOOK_ID, runId: RUN_ID });

    expect(payload.conflictFlags).toEqual([
      expect.objectContaining({
        relatedClaimIds           : [EVENT_ID_1],
        relatedPersonaCandidateIds: [CANDIDATE_ID_1]
      })
    ]);
  });
});
