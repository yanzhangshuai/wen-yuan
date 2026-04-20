/**
 * 被测对象：analysis/claims/claim-repository.ts。
 * 测试目标：
 *   - 锁定 stage-aware replace-by-scope 删除条件
 *   - 确认 reviewable claim family 走对 delegate
 *   - 阻止非法 stage/family 组合悄悄写库
 */

import { describe, expect, it, vi } from "vitest";

import type { ClaimCreateDataByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  ClaimRepositoryClient,
  ClaimRepositoryTransactionClient
} from "@/server/modules/analysis/claims/claim-repository";
import { createClaimRepository } from "@/server/modules/analysis/claims/claim-repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "55555555-5555-4555-8555-555555555555";
const REVIEWED_AT = new Date("2026-04-19T00:00:00.000Z");

function createRepositoryClient() {
  const entityMention = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 })
  };
  const aliasClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn().mockResolvedValue({ id: "alias-created" })
  };
  const eventClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn().mockResolvedValue({ id: "event-created" })
  };
  const relationClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 4 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn().mockResolvedValue({ id: "relation-created" })
  };
  const timeClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue({ id: "time-1", reviewState: "PENDING", source: "AI" }),
    update    : vi.fn().mockResolvedValue({ id: "time-1", reviewState: "EDITED", source: "AI" }),
    create    : vi.fn().mockResolvedValue({ id: "time-created" })
  };
  const identityResolutionClaim = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn().mockResolvedValue({ id: "identity-created" })
  };
  const conflictFlag = {
    createMany: vi.fn().mockResolvedValue({ count: 0 }),
    deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
    findUnique: vi.fn().mockResolvedValue(null),
    update    : vi.fn(),
    create    : vi.fn().mockResolvedValue({ id: "conflict-created" })
  };

  const tx: ClaimRepositoryTransactionClient = {
    entityMention,
    aliasClaim,
    eventClaim,
    relationClaim,
    timeClaim,
    identityResolutionClaim,
    conflictFlag
  };

  const prisma: ClaimRepositoryClient = {
    ...tx,
    $transaction: vi.fn(
      async (callback: (client: ClaimRepositoryTransactionClient) => Promise<unknown>) => callback(tx)
    ) as unknown as ClaimRepositoryClient["$transaction"]
  };

  return { prisma, tx };
}

describe("claim repository replace-by-scope", () => {
  it("replaces stage-a alias claims by run and chapter while keeping manual rows out of delete scope", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family: "ALIAS",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      rows: [
        {
          bookId                  : BOOK_ID,
          chapterId               : CHAPTER_ID,
          aliasText               : "范老爷",
          aliasType               : "TITLE",
          personaCandidateId      : null,
          targetPersonaCandidateId: null,
          claimKind               : "TITLE_OF",
          evidenceSpanIds         : ["66666666-6666-4666-8666-666666666666"],
          confidence              : 0.8,
          reviewState             : "PENDING",
          source                  : "AI",
          runId                   : RUN_ID,
          supersedesClaimId       : null,
          derivedFromClaimId      : null,
          createdByUserId         : null,
          reviewedByUserId        : null,
          reviewNote              : null
        }
      ]
    })).resolves.toEqual({ deletedCount: 1, createdCount: 2 });

    expect(tx.aliasClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: null
      }
    });
  });

  it("replaces stage-c relation claims using derived ai ownership instead of deleting root extraction rows", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await repository.replaceClaimFamilyScope({
      family: "RELATION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_c_fact_attribution"
      },
      rows: []
    });

    expect(tx.relationClaim.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: { not: null }
      }
    });
    expect(tx.relationClaim.createMany).not.toHaveBeenCalled();
  });

  it.each([
    {
      family        : "ENTITY_MENTION" as const,
      scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_extraction" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "AI" },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "entityMention" as const
    },
    {
      family        : "ENTITY_MENTION" as const,
      scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_plus_knowledge_recall" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "RULE" },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "entityMention" as const
    },
    {
      family        : "ALIAS" as const,
      scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_plus_knowledge_recall" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "RULE" },
      expectedResult: { deletedCount: 1, createdCount: 0 },
      deleteSpyKey  : "aliasClaim" as const
    },
    {
      family       : "EVENT" as const,
      scope        : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_extraction" as const },
      expectedWhere: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: null
      },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "eventClaim" as const
    },
    {
      family        : "EVENT" as const,
      scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_plus_knowledge_recall" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "RULE" },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "eventClaim" as const
    },
    {
      family       : "EVENT" as const,
      scope        : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_c_fact_attribution" as const },
      expectedWhere: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: { not: null }
      },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "eventClaim" as const
    },
    {
      family       : "RELATION" as const,
      scope        : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_extraction" as const },
      expectedWhere: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: null
      },
      expectedResult: { deletedCount: 4, createdCount: 0 },
      deleteSpyKey  : "relationClaim" as const
    },
    {
      family        : "RELATION" as const,
      scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_plus_knowledge_recall" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "RULE" },
      expectedResult: { deletedCount: 4, createdCount: 0 },
      deleteSpyKey  : "relationClaim" as const
    },
    {
      family       : "TIME" as const,
      scope        : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_extraction" as const },
      expectedWhere: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: null
      },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "timeClaim" as const
    },
    {
      family        : "TIME" as const,
      scope         : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_a_plus_knowledge_recall" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, source: "RULE" },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "timeClaim" as const
    },
    {
      family       : "TIME" as const,
      scope        : { bookId: BOOK_ID, chapterId: CHAPTER_ID, runId: RUN_ID, stageKey: "stage_c_fact_attribution" as const },
      expectedWhere: {
        bookId            : BOOK_ID,
        chapterId         : CHAPTER_ID,
        runId             : RUN_ID,
        source            : "AI",
        derivedFromClaimId: { not: null }
      },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "timeClaim" as const
    },
    {
      family        : "IDENTITY_RESOLUTION" as const,
      scope         : { bookId: BOOK_ID, runId: RUN_ID, stageKey: "stage_b_identity_resolution" as const },
      expectedWhere : { bookId: BOOK_ID, runId: RUN_ID, source: "AI" },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "identityResolutionClaim" as const
    },
    {
      family        : "CONFLICT_FLAG" as const,
      scope         : { bookId: BOOK_ID, chapterId: null, runId: RUN_ID, stageKey: "stage_b5_conflict_detection" as const },
      expectedWhere : { bookId: BOOK_ID, chapterId: null, runId: RUN_ID, source: "RULE" },
      expectedResult: { deletedCount: 0, createdCount: 0 },
      deleteSpyKey  : "conflictFlag" as const
    }
  ])("builds the correct delete scope for $family at $scope.stageKey", async ({ family, scope, expectedWhere, expectedResult, deleteSpyKey }) => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family,
      scope,
      rows: []
    })).resolves.toEqual(expectedResult);

    expect(tx[deleteSpyKey].deleteMany).toHaveBeenCalledWith({ where: expectedWhere });
  });

  it.each([
    { family: "ALIAS" as const, stageKey: "stage_b_identity_resolution" as const },
    { family: "EVENT" as const, stageKey: "stage_b_identity_resolution" as const },
    { family: "RELATION" as const, stageKey: "stage_b5_conflict_detection" as const },
    { family: "TIME" as const, stageKey: "stage_b_identity_resolution" as const },
    { family: "CONFLICT_FLAG" as const, stageKey: "stage_c_fact_attribution" as const }
  ])("rejects unsupported $family replacement at $stageKey", async ({ family, stageKey }) => {
    const { prisma } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family,
      scope: {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey
      },
      rows: []
    })).rejects.toThrowError(`Stage ${stageKey} cannot replace claim family ${family}`);
  });

  it("rejects chapter-scoped families when chapterId is missing", async () => {
    const { prisma } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family: "ENTITY_MENTION",
      scope : {
        bookId  : BOOK_ID,
        runId   : RUN_ID,
        stageKey: "stage_a_extraction"
      },
      rows: []
    })).rejects.toThrowError("Stage stage_a_extraction requires chapterId for this claim family");
  });

  it("rejects unsupported stage and claim-family combinations", async () => {
    const { prisma } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await expect(repository.replaceClaimFamilyScope({
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: CHAPTER_ID,
        runId    : RUN_ID,
        stageKey : "stage_a_extraction"
      },
      rows: []
    })).rejects.toThrowError(
      "Stage stage_a_extraction cannot replace claim family IDENTITY_RESOLUTION"
    );
  });
});

describe("claim repository reviewable delegates", () => {
  it.each([
    { family: "ALIAS" as const, claimId: "alias-1", delegateKey: "aliasClaim" as const },
    { family: "EVENT" as const, claimId: "event-1", delegateKey: "eventClaim" as const },
    { family: "RELATION" as const, claimId: "relation-1", delegateKey: "relationClaim" as const },
    { family: "TIME" as const, claimId: "time-1", delegateKey: "timeClaim" as const },
    {
      family     : "IDENTITY_RESOLUTION" as const,
      claimId    : "identity-1",
      delegateKey: "identityResolutionClaim" as const
    },
    { family: "CONFLICT_FLAG" as const, claimId: "conflict-1", delegateKey: "conflictFlag" as const }
  ])("routes summary lookup for $family through $delegateKey", async ({ family, claimId, delegateKey }) => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await repository.findReviewableClaimSummary(family, claimId);

    expect(tx[delegateKey].findUnique).toHaveBeenCalledWith({
      where : { id: claimId },
      select: { id: true, reviewState: true, source: true }
    });
  });

  it("finds and updates reviewable claim summaries through the correct family delegate", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    const summary = await repository.findReviewableClaimSummary("TIME", "time-1");

    expect(summary).toEqual({
      id         : "time-1",
      reviewState: "PENDING",
      source     : "AI"
    });
    expect(tx.timeClaim.findUnique).toHaveBeenCalledWith({
      where : { id: "time-1" },
      select: { id: true, reviewState: true, source: true }
    });

    await repository.updateReviewableClaimReviewState({
      family          : "TIME",
      claimId         : "time-1",
      reviewState     : "EDITED",
      reviewedByUserId: USER_ID,
      reviewedAt      : REVIEWED_AT,
      reviewNote      : "人工修订"
    });

    expect(tx.timeClaim.update).toHaveBeenCalledWith({
      where: { id: "time-1" },
      data : {
        reviewState     : "EDITED",
        reviewedByUserId: USER_ID,
        reviewedAt      : REVIEWED_AT,
        reviewNote      : "人工修订"
      }
    });
  });

  it("creates reviewable claims through the selected delegate", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);
    const aliasData = {} as ClaimCreateDataByFamily["ALIAS"];

    await expect(repository.createReviewableClaim("ALIAS", aliasData)).resolves.toEqual({
      id: "alias-created"
    });
    expect(tx.aliasClaim.create).toHaveBeenCalledWith({ data: aliasData });
  });

  it("wraps operations in prisma transactions and reuses the transaction repository inside nested callbacks", async () => {
    const { prisma, tx } = createRepositoryClient();
    const repository = createClaimRepository(prisma);

    await repository.transaction(async (txRepository) => {
      await txRepository.replaceClaimFamilyScope({
        family: "CONFLICT_FLAG",
        scope : {
          bookId   : BOOK_ID,
          chapterId: null,
          runId    : RUN_ID,
          stageKey : "stage_b5_conflict_detection"
        },
        rows: []
      });

      await txRepository.transaction(async (nestedRepository) => {
        await nestedRepository.findReviewableClaimSummary("ALIAS", "alias-2");
      });
    });

    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.conflictFlag.deleteMany).toHaveBeenCalledWith({
      where: {
        bookId   : BOOK_ID,
        chapterId: null,
        runId    : RUN_ID,
        source   : "RULE"
      }
    });
    expect(tx.aliasClaim.findUnique).toHaveBeenCalledWith({
      where : { id: "alias-2" },
      select: { id: true, reviewState: true, source: true }
    });
  });
});
