import { describe, expect, it, vi } from "vitest";

import { type PrismaClient } from "@/generated/prisma/client";
import { BioCategory } from "@/generated/prisma/enums";
import { createSequentialReviewOutputAdapter } from "@/server/modules/analysis/review-output/sequential-review-output";

const BOOK_ID      = "11111111-1111-4111-8111-111111111111";
const RUN_ID       = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const PERSONA_ID_1 = "44444444-4444-4444-8444-444444444444";
const PERSONA_ID_2 = "55555555-5555-4555-8555-555555555555";
const MENTION_ID_1 = "66666666-6666-4666-8666-666666666666";
const BIO_ID_1     = "77777777-7777-4777-8777-777777777777";
const REL_ID_1     = "88888888-8888-4888-8888-888888888888";
const SEGMENT_ID_1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const SPAN_ID_1    = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const SPAN_ID_2    = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const CAND_ID_1    = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const CAND_ID_2    = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const EM_ID_1      = "ffffffff-ffff-4fff-8fff-ffffffffffff";
const TIME_CLAIM_ID_1 = "f0f0f0f0-f0f0-4f0f-8f0f-f0f0f0f0f0f0";
const TIME_CLAIM_ID_2 = "f1f1f1f1-f1f1-4f1f-8f1f-f1f1f1f1f1f1";

const CHAPTER_CONTENT = "范进中举了这件大事";

function makeTx() {
  return {
    chapter: {
      findMany: vi.fn().mockResolvedValue([
        { id: CHAPTER_ID_1, no: 1, title: "第一回", content: CHAPTER_CONTENT }
      ])
    },
    mention: {
      findMany: vi.fn().mockResolvedValue([
        {
          id       : MENTION_ID_1,
          chapterId: CHAPTER_ID_1,
          rawText  : "范进",
          personaId: PERSONA_ID_1,
          persona  : { id: PERSONA_ID_1, name: "范进" }
        }
      ])
    },
    biographyRecord: {
      findMany: vi.fn().mockResolvedValue([
        {
          id       : BIO_ID_1,
          chapterId: CHAPTER_ID_1,
          personaId: PERSONA_ID_1,
          chapterNo: 1,
          category : BioCategory.EXAM,
          title    : "山东学道",
          event    : "范进中了举人",
          virtualYear: null,
          persona  : { id: PERSONA_ID_1, name: "范进" }
        }
      ])
    },
    relationship: {
      findMany: vi.fn().mockResolvedValue([
        {
          id       : REL_ID_1,
          chapterId: CHAPTER_ID_1,
          sourceId : PERSONA_ID_1,
          targetId : PERSONA_ID_2,
          type     : "同年",
          source   : { id: PERSONA_ID_1, name: "范进" },
          target   : { id: PERSONA_ID_2, name: "周进" }
        }
      ])
    },
    personaCandidate: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create    : vi.fn()
        .mockResolvedValueOnce({ id: CAND_ID_1 })
        .mockResolvedValueOnce({ id: CAND_ID_2 })
    },
    chapterSegment: {
      findFirst: vi.fn().mockResolvedValue(null),
      create   : vi.fn().mockResolvedValue({ id: SEGMENT_ID_1 })
    },
    evidenceSpan: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create    : vi.fn()
        .mockResolvedValueOnce({ id: SPAN_ID_1 })
        .mockResolvedValueOnce({ id: SPAN_ID_2 })
    },
    entityMention: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      create    : vi.fn().mockResolvedValue({
        id                       : EM_ID_1,
        bookId                   : BOOK_ID,
        chapterId                : CHAPTER_ID_1,
        runId                    : RUN_ID,
        source                   : "AI",
        confidence               : 0.9,
        surfaceText              : "范进",
        mentionKind              : "NAMED",
        identityClaim            : null,
        aliasTypeHint            : null,
        speakerPersonaCandidateId: null,
        suspectedResolvesTo      : null,
        evidenceSpanId           : SPAN_ID_1
      })
    },
    eventClaim: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
      update    : vi.fn(),
      create    : vi.fn()
    },
    relationClaim: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
      update    : vi.fn(),
      create    : vi.fn()
    },
    identityResolutionClaim: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 1 }),
      findUnique: vi.fn(),
      update    : vi.fn(),
      create    : vi.fn()
    },
    aliasClaim: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      update    : vi.fn(),
      create    : vi.fn()
    },
    timeClaim: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      update    : vi.fn(),
      create    : vi.fn()
        .mockResolvedValueOnce({ id: TIME_CLAIM_ID_1 })
        .mockResolvedValueOnce({ id: TIME_CLAIM_ID_2 })
    },
    conflictFlag: {
      deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
      createMany: vi.fn().mockResolvedValue({ count: 0 }),
      findUnique: vi.fn(),
      update    : vi.fn(),
      create    : vi.fn()
    }
  };
}

const JOB_ID = "00000000-0000-4000-8000-000000000001";

function makePrisma(tx: ReturnType<typeof makeTx>, opts?: {
  analysisJobResult?: { id: string; bookId: string } | null;
  analysisRunResult?: { id: string } | null;
  outerChapters?    : Array<{ id: string }>;
}) {
  return {
    $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => Promise<unknown>) => fn(tx)),
    analysisJob : {
      findFirst: vi.fn().mockResolvedValue(
        opts?.analysisJobResult !== undefined
          ? opts.analysisJobResult
          : { id: JOB_ID, bookId: BOOK_ID }
      )
    },
    analysisRun: {
      findFirst: vi.fn().mockResolvedValue(
        opts?.analysisRunResult !== undefined
          ? opts.analysisRunResult
          : { id: RUN_ID }
      )
    },
    chapter: {
      findMany: vi.fn().mockResolvedValue(
        opts?.outerChapters !== undefined
          ? opts.outerChapters
          : [{ id: CHAPTER_ID_1 }]
      )
    }
  };
}

describe("createSequentialReviewOutputAdapter", () => {
  describe("writeBookReviewOutput", () => {
    it("converts legacy rows into accepted review claims with identity mappings", async () => {
      const tx = makeTx();
      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      expect(result).toEqual({
        personaCandidates       : 2,
        entityMentions          : 1,
        eventClaims             : 1,
        relationClaims          : 1,
        identityResolutionClaims: 1,
        timeClaims              : 1
      });

      // PersonaCandidate: 先删后建
      expect(tx.personaCandidate.deleteMany).toHaveBeenCalledWith({
        where: { bookId: BOOK_ID, runId: RUN_ID }
      });
      expect(tx.personaCandidate.create).toHaveBeenCalledTimes(2);
      expect(tx.personaCandidate.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookId         : BOOK_ID,
            runId          : RUN_ID,
            canonicalLabel : "范进",
            candidateStatus: "CONFIRMED"
          })
        })
      );

      // ChapterSegment: 不存在时自动创建
      expect(tx.chapterSegment.findFirst).toHaveBeenCalledWith({
        where: { runId: RUN_ID, chapterId: CHAPTER_ID_1, segmentIndex: 0 }
      });
      expect(tx.chapterSegment.create).toHaveBeenCalledOnce();
      expect(tx.chapterSegment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookId      : BOOK_ID,
            chapterId   : CHAPTER_ID_1,
            runId       : RUN_ID,
            segmentIndex: 0,
            segmentType : "NARRATIVE",
            startOffset : 0,
            endOffset   : CHAPTER_CONTENT.length
          })
        })
      );

      // EntityMention: 删旧建新
      expect(tx.entityMention.deleteMany).toHaveBeenCalledWith({
        where: { bookId: BOOK_ID, chapterId: CHAPTER_ID_1, runId: RUN_ID, source: "AI" }
      });

      // EvidenceSpan: 删旧建新（防止重跑产生孤儿行）
      expect(tx.evidenceSpan.deleteMany).toHaveBeenCalledWith({
        where: { bookId: BOOK_ID, chapterId: CHAPTER_ID_1, createdByRunId: RUN_ID }
      });

      expect(tx.entityMention.create).toHaveBeenCalledOnce();
      expect(tx.entityMention.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            surfaceText: "范进",
            source     : "AI",
            runId      : RUN_ID
          })
        })
      );

      // EventClaim: reviewState = ACCEPTED, predicate 来自 biography.title
      expect(tx.eventClaim.createMany).toHaveBeenCalledOnce();
      expect(tx.eventClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              reviewState              : "ACCEPTED",
              source                   : "AI",
              predicate                : "山东学道",
              subjectPersonaCandidateId: CAND_ID_1
            })
          ])
        })
      );

      // RelationClaim: reviewState = ACCEPTED, candidate IDs 正确
      expect(tx.relationClaim.createMany).toHaveBeenCalledOnce();
      expect(tx.relationClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              reviewState             : "ACCEPTED",
              source                  : "AI",
              relationTypeKey         : "同年",
              sourcePersonaCandidateId: CAND_ID_1,
              targetPersonaCandidateId: CAND_ID_2
            })
          ])
        })
      );

      // IdentityResolutionClaim: mentionId 对应新建 EntityMention ID
      expect(tx.identityResolutionClaim.createMany).toHaveBeenCalledOnce();
      expect(tx.identityResolutionClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              reviewState       : "ACCEPTED",
              source            : "AI",
              mentionId         : EM_ID_1,
              personaCandidateId: CAND_ID_1,
              resolvedPersonaId : PERSONA_ID_1,
              resolutionKind    : "RESOLVES_TO",
              rationale         : "sequential legacy resolver accepted this persona"
            })
          ])
        })
      );
    });

    it("uses existing segment when one already exists for the run/chapter", async () => {
      const tx = makeTx();
      tx.chapterSegment.findFirst.mockResolvedValue({ id: SEGMENT_ID_1 });

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      expect(tx.chapterSegment.findFirst).toHaveBeenCalled();
      expect(tx.chapterSegment.create).not.toHaveBeenCalled();
    });

    it("falls back to persona name as surfaceText when rawText is absent from chapter content", async () => {
      const tx = makeTx();
      tx.mention.findMany.mockResolvedValue([
        {
          id       : MENTION_ID_1,
          chapterId: CHAPTER_ID_1,
          rawText  : "找不到的文字",
          personaId: PERSONA_ID_1,
          persona  : { id: PERSONA_ID_1, name: "范进" }
        }
      ]);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      expect(result.entityMentions).toBe(1);
      expect(tx.entityMention.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ surfaceText: "范进" })
        })
      );
      // rawText 不在 content 中时，evidence span 从偏移 0 开始
      expect(tx.evidenceSpan.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ startOffset: 0, endOffset: 1 })
        })
      );
    });

    it("uses category string as predicate when biography title is null", async () => {
      const tx = makeTx();
      tx.biographyRecord.findMany.mockResolvedValue([
        {
          id       : BIO_ID_1,
          chapterId: CHAPTER_ID_1,
          personaId: PERSONA_ID_1,
          chapterNo: 1,
          category : BioCategory.EVENT,
          title    : null,
          event    : "某件大事",
          persona  : { id: PERSONA_ID_1, name: "范进" }
        }
      ]);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      expect(tx.eventClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ predicate: "EVENT" })
          ])
        })
      );
    });

    it("handles empty chapter list by returning zero counts", async () => {
      const tx = makeTx();
      tx.chapter.findMany.mockResolvedValue([]);
      tx.mention.findMany.mockResolvedValue([]);
      tx.biographyRecord.findMany.mockResolvedValue([]);
      tx.relationship.findMany.mockResolvedValue([]);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: []
      });

      expect(result).toEqual({
        personaCandidates       : 0,
        entityMentions          : 0,
        eventClaims             : 0,
        relationClaims          : 0,
        identityResolutionClaims: 0,
        timeClaims              : 0
      });
      expect(tx.personaCandidate.deleteMany).toHaveBeenCalledWith({
        where: { bookId: BOOK_ID, runId: RUN_ID }
      });
      expect(tx.personaCandidate.create).not.toHaveBeenCalled();
    });

    it("rejects and does not return successful counts when event claim createMany fails", async () => {
      const tx = makeTx();
      tx.eventClaim.createMany.mockRejectedValue(new Error("DB write failed"));

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await expect(
        adapter.writeBookReviewOutput({
          bookId    : BOOK_ID,
          runId     : RUN_ID,
          chapterIds: [CHAPTER_ID_1]
        })
      ).rejects.toThrow("DB write failed");
    });

    it("writes accepted CHAPTER_ORDER time claim and threads timeHintId into event/relation claims", async () => {
      const tx = makeTx();
      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      // result must count time claims
      expect(result.timeClaims).toBe(1);

      // timeClaim.deleteMany must be called before timeClaim.create
      expect(tx.timeClaim.deleteMany).toHaveBeenCalledWith({
        where: expect.objectContaining({
          bookId            : BOOK_ID,
          chapterId         : CHAPTER_ID_1,
          runId             : RUN_ID,
          source            : "AI",
          derivedFromClaimId: null
        })
      });

      // timeClaim.create must be called with an accepted CHAPTER_ORDER claim
      expect(tx.timeClaim.create).toHaveBeenCalledOnce();
      expect(tx.timeClaim.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookId           : BOOK_ID,
            chapterId        : CHAPTER_ID_1,
            runId            : RUN_ID,
            source           : "AI",
            reviewState      : "ACCEPTED",
            timeType         : "CHAPTER_ORDER",
            normalizedLabel  : "第1章",
            chapterRangeStart: 1,
            chapterRangeEnd  : 1
          })
        })
      );

      // event claims must carry the time claim id
      expect(tx.eventClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ timeHintId: TIME_CLAIM_ID_1 })
          ])
        })
      );

      // relation claims must carry the chapter-order time claim id
      expect(tx.relationClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ timeHintId: TIME_CLAIM_ID_1 })
          ])
        })
      );
    });

    it("creates separate explicit time claim for biography with non-empty virtualYear", async () => {
      const tx = makeTx();
      tx.biographyRecord.findMany.mockResolvedValue([
        {
          id         : BIO_ID_1,
          chapterId  : CHAPTER_ID_1,
          personaId  : PERSONA_ID_1,
          chapterNo  : 1,
          category   : BioCategory.EXAM,
          title      : "山东学道",
          event      : "范进中了举人",
          virtualYear: "嘉靖年间",
          persona    : { id: PERSONA_ID_1, name: "范进" }
        }
      ]);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      // two time claims: CHAPTER_ORDER + virtualYear
      expect(result.timeClaims).toBe(2);
      expect(tx.timeClaim.create).toHaveBeenCalledTimes(2);

      // second call should be the explicit time claim for "嘉靖年间"
      expect(tx.timeClaim.create).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          data: expect.objectContaining({
            rawTimeText    : "嘉靖年间",
            normalizedLabel: "嘉靖年间",
            timeType       : "UNCERTAIN"
          })
        })
      );

      // event claim for bio with virtualYear should point to explicit time claim (TIME_CLAIM_ID_2)
      expect(tx.eventClaim.createMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({ timeHintId: TIME_CLAIM_ID_2 })
          ])
        })
      );
    });

    it("uses validatedChapterIds from DB result for legacy queries, ignoring orphan caller input", async () => {
      const ORPHAN_ID = "99999999-9999-4999-8999-999999999999";
      const tx = makeTx();
      // chapter.findMany returns only CHAPTER_ID_1 even though ORPHAN_ID was in input
      tx.chapter.findMany.mockResolvedValue([
        { id: CHAPTER_ID_1, no: 1, title: "第一回", content: CHAPTER_CONTENT }
      ]);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1, ORPHAN_ID]
      });

      // Legacy queries must use the validated set (only CHAPTER_ID_1), not the raw input
      expect(tx.mention.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chapterId: { in: [CHAPTER_ID_1] }
          })
        })
      );
      expect(tx.biographyRecord.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chapterId: { in: [CHAPTER_ID_1] }
          })
        })
      );
      expect(tx.relationship.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            chapterId: { in: [CHAPTER_ID_1] }
          })
        })
      );
    });

    it("warns when chapter content is empty but legacy biography or relation rows exist", async () => {
      const tx = makeTx();
      tx.chapter.findMany.mockResolvedValue([
        { id: CHAPTER_ID_1, no: 1, title: "第一回", content: "" }
      ]);
      // Keep bio and relation rows pointing to that chapter
      const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      // event and relation claims must NOT be created (no evidence span)
      expect(result.eventClaims).toBe(0);
      expect(result.relationClaims).toBe(0);
      expect(result.timeClaims).toBe(0);
      expect(tx.eventClaim.createMany).not.toHaveBeenCalled();
      expect(tx.relationClaim.createMany).not.toHaveBeenCalled();
      expect(tx.timeClaim.create).not.toHaveBeenCalled();
      expect(tx.timeClaim.deleteMany).not.toHaveBeenCalled();

      // warn must have fired with structured context
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining("empty content"),
        expect.objectContaining({
          bookId        : BOOK_ID,
          runId         : RUN_ID,
          chapterId     : CHAPTER_ID_1,
          biographyCount: 1,
          relationCount : 1
        })
      );
      warnSpy.mockRestore();
    });

    it("re-run deletes evidence spans before creating new ones (no orphaned duplicates)", async () => {
      // 回归测试：相同 { bookId, runId, chapterIds } 重跑时，evidenceSpan.deleteMany
      // 必须在任何 evidenceSpan.create 之前被调用，且 where 条件正确作用域。
      const tx = makeTx();
      const callOrder: string[] = [];
      tx.evidenceSpan.deleteMany = vi.fn().mockImplementation(() => {
        callOrder.push("deleteMany");
        return Promise.resolve({ count: 2 });
      });
      tx.evidenceSpan.create = vi.fn()
        .mockImplementation(() => {
          callOrder.push("create");
          return Promise.resolve({ id: SPAN_ID_1 });
        })
        // second call for chapter-level span
        .mockImplementationOnce(() => {
          callOrder.push("create");
          return Promise.resolve({ id: SPAN_ID_1 });
        })
        .mockImplementationOnce(() => {
          callOrder.push("create");
          return Promise.resolve({ id: SPAN_ID_2 });
        });

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      // deleteMany must have been called with correct scope
      expect(tx.evidenceSpan.deleteMany).toHaveBeenCalledWith({
        where: { bookId: BOOK_ID, chapterId: CHAPTER_ID_1, createdByRunId: RUN_ID }
      });

      // deleteMany must precede all create calls for the same chapter
      const firstCreate  = callOrder.indexOf("create");
      const lastDeleteMany = callOrder.lastIndexOf("deleteMany");
      expect(lastDeleteMany).toBeLessThan(firstCreate);
    });

    it("does not create time claims for non-empty chapter with no bio or relation rows", async () => {
      const tx = makeTx();
      tx.biographyRecord.findMany.mockResolvedValue([]);
      tx.relationship.findMany.mockResolvedValue([]);

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      expect(result.timeClaims).toBe(0);
      expect(result.eventClaims).toBe(0);
      expect(result.relationClaims).toBe(0);
      expect(tx.timeClaim.create).not.toHaveBeenCalled();
      expect(tx.timeClaim.deleteMany).not.toHaveBeenCalled();
    });

    it("timeClaim.deleteMany is called before timeClaim.create on re-run", async () => {
      const tx = makeTx();
      const callOrder: string[] = [];
      tx.timeClaim.deleteMany = vi.fn().mockImplementation(() => {
        callOrder.push("timeClaim.deleteMany");
        return Promise.resolve({ count: 1 });
      });
      tx.timeClaim.create = vi.fn()
        .mockImplementationOnce(() => {
          callOrder.push("timeClaim.create");
          return Promise.resolve({ id: TIME_CLAIM_ID_1 });
        })
        .mockImplementationOnce(() => {
          callOrder.push("timeClaim.create");
          return Promise.resolve({ id: TIME_CLAIM_ID_2 });
        });

      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await adapter.writeBookReviewOutput({
        bookId    : BOOK_ID,
        runId     : RUN_ID,
        chapterIds: [CHAPTER_ID_1]
      });

      const firstCreate      = callOrder.indexOf("timeClaim.create");
      const lastDeleteMany   = callOrder.lastIndexOf("timeClaim.deleteMany");
      expect(lastDeleteMany).toBeGreaterThanOrEqual(0);
      expect(firstCreate).toBeGreaterThan(lastDeleteMany);
    });
  });

  describe("backfillLatestSucceededSequentialJob", () => {
    it("happy path: finds job, run, chapters, then delegates to writeBookReviewOutput", async () => {
      const tx = makeTx();
      const prismaClient = makePrisma(tx);
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      const result = await adapter.backfillLatestSucceededSequentialJob({ bookId: BOOK_ID });

      // job lookup: architecture=sequential, status=SUCCEEDED, ordered by finishedAt desc
      expect(prismaClient.analysisJob.findFirst).toHaveBeenCalledWith({
        where  : { bookId: BOOK_ID, architecture: "sequential", status: "SUCCEEDED" },
        orderBy: { finishedAt: "desc" },
        select : { id: true, bookId: true }
      });

      // analysisRun lookup: by job id, latest first
      expect(prismaClient.analysisRun.findFirst).toHaveBeenCalledWith({
        where  : { jobId: JOB_ID },
        orderBy: { startedAt: "desc" },
        select : { id: true }
      });

      // outer chapter lookup: all chapters for book
      expect(prismaClient.chapter.findMany).toHaveBeenCalledWith({
        where : { bookId: BOOK_ID },
        select: { id: true }
      });

      // writeBookReviewOutput was triggered (evidenced by $transaction being called)
      expect(prismaClient.$transaction).toHaveBeenCalled();

      // result shape is SequentialReviewOutputResult
      expect(result).toMatchObject({
        personaCandidates       : expect.any(Number),
        entityMentions          : expect.any(Number),
        eventClaims             : expect.any(Number),
        relationClaims          : expect.any(Number),
        identityResolutionClaims: expect.any(Number)
      });
    });

    it("throws when no succeeded sequential job exists for the book", async () => {
      const tx = makeTx();
      const prismaClient = makePrisma(tx, { analysisJobResult: null });
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await expect(
        adapter.backfillLatestSucceededSequentialJob({ bookId: BOOK_ID })
      ).rejects.toThrow(`No succeeded sequential analysis job found for book ${BOOK_ID}`);

      expect(prismaClient.analysisRun.findFirst).not.toHaveBeenCalled();
      expect(prismaClient.$transaction).not.toHaveBeenCalled();
    });

    it("throws when no analysis run exists for the found job", async () => {
      const tx = makeTx();
      const prismaClient = makePrisma(tx, { analysisRunResult: null });
      const adapter = createSequentialReviewOutputAdapter(prismaClient as unknown as PrismaClient);

      await expect(
        adapter.backfillLatestSucceededSequentialJob({ bookId: BOOK_ID })
      ).rejects.toThrow(`No analysis run found for job ${JOB_ID}`);

      expect(prismaClient.$transaction).not.toHaveBeenCalled();
    });
  });
});
