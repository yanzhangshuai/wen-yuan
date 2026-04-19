import { describe, expect, it } from "vitest";

import {
  createStageAClaimPersister,
  type StageAClaimPersisterRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stageA/claim-persister";
import type { StageANormalizedExtraction } from "@/server/modules/analysis/pipelines/evidence-review/stageA/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function createRepository(): {
  repository: StageAClaimPersisterRepository;
  stored: {
    mentions : Array<Record<string, unknown>>;
    times    : Array<Record<string, unknown>>;
    events   : Array<Record<string, unknown>>;
    relations: Array<Record<string, unknown>>;
  };
} {
  const stored = {
    mentions : [] as Array<Record<string, unknown>>,
    times    : [] as Array<Record<string, unknown>>,
    events   : [] as Array<Record<string, unknown>>,
    relations: [] as Array<Record<string, unknown>>
  };

  let nextId = 1;

  const repository: StageAClaimPersisterRepository = {
    async transaction<T>(
      work: (tx: StageAClaimPersisterRepository) => Promise<T>
    ): Promise<T> {
      return work(repository);
    },
    async clearFamilyScope(family) {
      if (family === "ENTITY_MENTION") stored.mentions = [];
      if (family === "TIME") stored.times = [];
      if (family === "EVENT") stored.events = [];
      if (family === "RELATION") stored.relations = [];
    },
    async createEntityMention(data) {
      const created = {
        id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        ...data
      };
      stored.mentions.push(created);
      return created;
    },
    async createReviewableClaim(family, data) {
      const created = {
        id: `00000000-0000-4000-8000-${String(nextId++).padStart(12, "0")}`,
        ...data
      };

      if (family === "TIME") stored.times.push(created);
      if (family === "EVENT") stored.events.push(created);
      if (family === "RELATION") stored.relations.push(created);
      return created;
    }
  };

  return { repository, stored };
}

function buildNormalized(): StageANormalizedExtraction {
  return {
    mentionClaims: [
      {
        ref  : "m1",
        draft: {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          runId                    : RUN_ID,
          source                   : "AI",
          confidence               : 0.9,
          surfaceText              : "王冕",
          mentionKind              : "NAMED",
          identityClaim            : null,
          aliasTypeHint            : null,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId           : "44444444-4444-4444-8444-444444444441"
        }
      },
      {
        ref  : "m2",
        draft: {
          claimFamily              : "ENTITY_MENTION",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          runId                    : RUN_ID,
          source                   : "AI",
          confidence               : 0.8,
          surfaceText              : "秦老",
          mentionKind              : "NAMED",
          identityClaim            : null,
          aliasTypeHint            : null,
          speakerPersonaCandidateId: null,
          suspectedResolvesTo      : null,
          evidenceSpanId           : "44444444-4444-4444-8444-444444444442"
        }
      }
    ],
    timeClaims: [
      {
        ref  : "t1",
        draft: {
          claimFamily        : "TIME",
          bookId             : BOOK_ID,
          chapterId          : CHAPTER_ID,
          runId              : RUN_ID,
          source             : "AI",
          reviewState        : "PENDING",
          createdByUserId    : null,
          reviewedByUserId   : null,
          reviewNote         : null,
          supersedesClaimId  : null,
          derivedFromClaimId : null,
          evidenceSpanIds    : ["44444444-4444-4444-8444-444444444443"],
          confidence         : 0.7,
          rawTimeText        : "次日",
          timeType           : "RELATIVE_PHASE",
          normalizedLabel    : "次日",
          relativeOrderWeight: null,
          chapterRangeStart  : null,
          chapterRangeEnd    : null
        }
      }
    ],
    pendingEventClaims: [
      {
        ref              : "e1",
        subjectMentionRef: "m1",
        timeRef          : "t1",
        draft            : {
          claimFamily              : "EVENT",
          bookId                   : BOOK_ID,
          chapterId                : CHAPTER_ID,
          runId                    : RUN_ID,
          source                   : "AI",
          reviewState              : "PENDING",
          createdByUserId          : null,
          reviewedByUserId         : null,
          reviewNote               : null,
          supersedesClaimId        : null,
          derivedFromClaimId       : null,
          evidenceSpanIds          : ["44444444-4444-4444-8444-444444444444"],
          confidence               : 0.8,
          subjectMentionId         : null,
          subjectPersonaCandidateId: null,
          predicate                : "发言",
          objectText               : "明日再谈",
          objectPersonaCandidateId : null,
          locationText             : null,
          timeHintId               : null,
          eventCategory            : "EVENT",
          narrativeLens            : "QUOTED"
        }
      }
    ],
    pendingRelationClaims: [
      {
        ref             : "r1",
        sourceMentionRef: "m1",
        targetMentionRef: "m2",
        timeRef         : null,
        draft           : {
          claimFamily             : "RELATION",
          bookId                  : BOOK_ID,
          chapterId               : CHAPTER_ID,
          runId                   : RUN_ID,
          source                  : "AI",
          reviewState             : "PENDING",
          createdByUserId         : null,
          reviewedByUserId        : null,
          reviewNote              : null,
          supersedesClaimId       : null,
          derivedFromClaimId      : null,
          evidenceSpanIds         : ["44444444-4444-4444-8444-444444444445"],
          confidence              : 0.65,
          sourceMentionId         : null,
          targetMentionId         : null,
          sourcePersonaCandidateId: null,
          targetPersonaCandidateId: null,
          relationTypeKey         : "host_of",
          relationLabel           : "接待",
          relationTypeSource      : "CUSTOM",
          direction               : "FORWARD",
          effectiveChapterStart   : null,
          effectiveChapterEnd     : null,
          timeHintId              : null
        }
      }
    ],
    discardRecords: []
  };
}

describe("Stage A claim persister", () => {
  it("creates mention/time ids first and then binds them into event/relation claims", async () => {
    const fixture = createRepository();
    const persister = createStageAClaimPersister({
      repository: fixture.repository
    });

    const result = await persister.persistChapterClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      normalized: buildNormalized()
    });

    expect(result.persistedCounts).toEqual({
      mentions : 2,
      times    : 1,
      events   : 1,
      relations: 1
    });
    expect(result.mentionIdsByRef).toMatchObject({
      m1: "00000000-0000-4000-8000-000000000001",
      m2: "00000000-0000-4000-8000-000000000002"
    });
    expect(result.timeIdsByRef).toMatchObject({
      t1: "00000000-0000-4000-8000-000000000003"
    });
    expect(fixture.stored.events[0]).toMatchObject({
      subjectMentionId: "00000000-0000-4000-8000-000000000001",
      timeHintId      : "00000000-0000-4000-8000-000000000003"
    });
    expect(fixture.stored.relations[0]).toMatchObject({
      sourceMentionId: "00000000-0000-4000-8000-000000000001",
      targetMentionId: "00000000-0000-4000-8000-000000000002"
    });
  });

  it("turns unresolved refs into discard records instead of partial writes", async () => {
    const fixture = createRepository();
    const persister = createStageAClaimPersister({
      repository: fixture.repository
    });
    const normalized = buildNormalized();
    normalized.pendingEventClaims[0].subjectMentionRef = "missing";
    normalized.pendingRelationClaims[0].targetMentionRef = "missing";

    const result = await persister.persistChapterClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      normalized
    });

    expect(result.persistedCounts).toEqual({
      mentions : 2,
      times    : 1,
      events   : 0,
      relations: 0
    });
    expect(result.discardRecords).toEqual([
      {
        kind   : "EVENT",
        ref    : "e1",
        code   : "UNRESOLVED_MENTION_REF",
        message: expect.stringContaining("subjectMentionRef")
      },
      {
        kind   : "RELATION",
        ref    : "r1",
        code   : "UNRESOLVED_MENTION_REF",
        message: expect.stringContaining("targetMentionRef")
      }
    ]);
  });

  it("replaces the chapter scope on rerun instead of duplicating rows", async () => {
    const fixture = createRepository();
    const persister = createStageAClaimPersister({
      repository: fixture.repository
    });

    await persister.persistChapterClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      normalized: buildNormalized()
    });

    await persister.persistChapterClaims({
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      normalized: buildNormalized()
    });

    expect(fixture.stored.mentions).toHaveLength(2);
    expect(fixture.stored.times).toHaveLength(1);
    expect(fixture.stored.events).toHaveLength(1);
    expect(fixture.stored.relations).toHaveLength(1);
  });
});
