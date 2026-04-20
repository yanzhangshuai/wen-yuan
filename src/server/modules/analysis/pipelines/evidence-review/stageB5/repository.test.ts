import { describe, expect, it, vi } from "vitest";

import type {
  StageB5RepositoryClient,
  StageB5RepositoryTransactionClient
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";
import { createStageB5Repository } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID_2 = "44444444-4444-4444-8444-444444444444";

function createRepositoryClient() {
  const eventClaimFindMany = vi.fn().mockResolvedValue([
    {
      id                       : "event-1",
      bookId                   : BOOK_ID,
      chapterId                : CHAPTER_ID_2,
      runId                    : RUN_ID,
      subjectPersonaCandidateId: "candidate-1",
      objectPersonaCandidateId : null,
      predicate                : "赴宴",
      objectText               : null,
      locationText             : "北京",
      timeHintId               : "time-1",
      eventCategory            : "EVENT",
      narrativeLens            : "SELF",
      evidenceSpanIds          : ["evidence-2"],
      confidence               : 0.7,
      reviewState              : "PENDING",
      source                   : "AI",
      derivedFromClaimId       : null,
      reviewNote               : null,
      createdAt                : new Date("2026-04-20T00:00:01.000Z")
    }
  ]);

  const tx: StageB5RepositoryTransactionClient = {
    chapter: {
      findMany: vi.fn().mockResolvedValue([
        { id: CHAPTER_ID_1, no: 10 },
        { id: CHAPTER_ID_2, no: 12 }
      ])
    },
    personaCandidate: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                : "candidate-1",
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
    aliasClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id             : "alias-1",
          bookId         : BOOK_ID,
          chapterId      : CHAPTER_ID_1,
          runId          : RUN_ID,
          aliasText      : "范老爷",
          claimKind      : "TITLE_OF",
          evidenceSpanIds: ["evidence-1"],
          confidence     : 0.8,
          reviewState    : "PENDING",
          source         : "RULE",
          reviewNote     : "KB_VERIFIED: canonicalName=范进",
          createdAt      : new Date("2026-04-20T00:00:00.000Z")
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
          chapterId               : CHAPTER_ID_1,
          runId                   : RUN_ID,
          sourcePersonaCandidateId: "candidate-1",
          targetPersonaCandidateId: "candidate-2",
          relationTypeKey         : "teacher_of",
          relationLabel           : "师生",
          relationTypeSource      : "PRESET",
          direction               : "FORWARD",
          effectiveChapterStart   : 10,
          effectiveChapterEnd     : 12,
          timeHintId              : null,
          evidenceSpanIds         : ["evidence-3"],
          confidence              : 0.88,
          reviewState             : "PENDING",
          source                  : "AI",
          derivedFromClaimId      : null,
          reviewNote              : null,
          createdAt               : new Date("2026-04-20T00:00:02.000Z")
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
          evidenceSpanIds    : ["evidence-4"],
          confidence         : 0.61,
          reviewState        : "PENDING",
          source             : "AI",
          derivedFromClaimId : null,
          reviewNote         : null,
          createdAt          : new Date("2026-04-20T00:00:03.000Z")
        }
      ])
    },
    identityResolutionClaim: {
      findMany: vi.fn().mockResolvedValue([
        {
          id                : "identity-1",
          bookId            : BOOK_ID,
          chapterId         : null,
          runId             : RUN_ID,
          mentionId         : "mention-1",
          personaCandidateId: "candidate-1",
          resolutionKind    : "SPLIT_FROM",
          rationale         : "blocked alias chain",
          evidenceSpanIds   : ["evidence-5"],
          confidence        : 0.79,
          reviewState       : "CONFLICTED",
          source            : "AI",
          reviewNote        : "STAGE_B: blocks=NEGATIVE_ALIAS_RULE",
          createdAt         : new Date("2026-04-20T00:00:04.000Z")
        }
      ])
    }
  };

  const client: StageB5RepositoryClient = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (inner: StageB5RepositoryTransactionClient) => Promise<unknown>) => callback(tx)
    ) as StageB5RepositoryClient["$transaction"]
  };

  return { client, eventClaimFindMany, tx };
}

describe("stageB5/repository", () => {
  it("loads whole-book conflict inputs and maps chapter numbers", async () => {
    const { client, eventClaimFindMany } = createRepositoryClient();
    const repository = createStageB5Repository(client);

    const payload = await repository.loadConflictInputs({ bookId: BOOK_ID, runId: RUN_ID });

    expect(payload.personaCandidates).toHaveLength(1);
    expect(payload.aliasClaims[0]?.chapterNo).toBe(10);
    expect(payload.eventClaims[0]?.chapterNo).toBe(12);
    expect(payload.identityResolutionClaims[0]?.chapterNo).toBeNull();
    expect(eventClaimFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        bookId: BOOK_ID,
        runId : RUN_ID,
        source: { in: ["AI", "RULE"] }
      })
    }));
  });

  it("wraps nested work inside the provided transaction client", async () => {
    const { client } = createRepositoryClient();
    const repository = createStageB5Repository(client);

    const labels = await repository.transaction(async (txRepository) => {
      const payload = await txRepository.loadConflictInputs({ bookId: BOOK_ID, runId: RUN_ID });
      return payload.personaCandidates.map((row) => row.canonicalLabel);
    });

    expect(labels).toEqual(["范进"]);
  });
});
