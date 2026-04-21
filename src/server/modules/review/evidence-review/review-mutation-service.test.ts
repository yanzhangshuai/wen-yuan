import { describe, expect, it, vi } from "vitest";

import {
  BioCategory,
  ClaimKind,
  IdentityResolutionKind,
  NarrativeLens,
  ReviewAction
} from "@/generated/prisma/enums";
import type {
  ClaimRepository,
  ReviewableClaimSummary,
  UpdateReviewableClaimReviewStateInput
} from "@/server/modules/analysis/claims/claim-repository";
import type {
  ClaimCreateDataByFamily,
  ReviewableClaimFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import { createReviewMutationService } from "@/server/modules/review/evidence-review/review-mutation-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_BOOK_ID = "12121212-1212-4121-8121-121212121212";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const EVENT_ID_1 = "33333333-3333-4333-8333-333333333333";
const TIME_ID_1 = "34343434-3434-4343-8343-343434343434";
const CANDIDATE_ID_1 = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_2 = "45454545-4545-4545-8545-454545454545";
const CANDIDATE_ID_3 = "46464646-4646-4464-8464-464646464646";
const PERSONA_ID_1 = "55555555-5555-4555-8555-555555555555";
const PERSONA_ID_2 = "56565656-5656-4565-8565-565656565656";
const SOURCE_PERSONA_ID = PERSONA_ID_1;
const TARGET_PERSONA_ID = PERSONA_ID_2;
const USER_ID = "66666666-6666-4666-8666-666666666666";
const RUN_ID = "67676767-6767-4767-8767-676767676767";
const MENTION_ID_1 = "68686868-6868-4868-8868-686868686868";
const MENTION_ID_2 = "69696969-6969-4969-8969-696969696969";
const MENTION_ID_3 = "70707070-7070-4070-8070-707070707070";
const IDENTITY_ID_1 = "71717171-7171-4171-8171-717171717171";
const IDENTITY_ID_2 = "72727272-7272-4272-8272-727272727272";
const IDENTITY_ID_3 = "73737373-7373-4373-8373-737373737373";
const EVIDENCE_ID_1 = "88888888-8888-4888-8888-888888888888";
const EVIDENCE_ID_OLD = "89898989-8989-4989-8989-898989898989";
const EVIDENCE_ID_NEW = "90909090-9090-4909-8909-909090909090";
const RELATION_ID_1 = "91919191-9191-4919-8919-919191919191";
const MANUAL_EVENT_ID = "92929292-9292-4929-8929-929292929292";
const MANUAL_RELATION_ID = "93939393-9393-4939-8939-939393939393";
const MANUAL_IDENTITY_ID_1 = "94949494-9494-4949-8949-949494949494";
const MANUAL_IDENTITY_ID_2 = "95959595-9595-4959-8959-959595959595";
const MANUAL_IDENTITY_ID_3 = "96969696-9696-4969-8969-969696969696";
const NEW_PERSONA_ID = "97979797-9797-4979-8979-979797979797";

type TestRow = Record<string, unknown>;

interface PrismaMockSeed {
  aliasClaims?             : TestRow[];
  eventClaims?             : TestRow[];
  relationClaims?          : TestRow[];
  timeClaims?              : TestRow[];
  identityResolutionClaims?: TestRow[];
  conflictFlags?           : TestRow[];
}

function matchesWhere(row: TestRow, where?: Record<string, unknown>): boolean {
  if (!where) return true;

  for (const [key, value] of Object.entries(where)) {
    if (value === undefined) continue;

    const fieldValue = row[key];
    if (
      value !== null &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      !(value instanceof Date)
    ) {
      const condition = value as Record<string, unknown>;

      if ("in" in condition) {
        const options = condition.in as unknown[];
        if (!options.includes(fieldValue)) return false;
        continue;
      }

      if ("not" in condition) {
        if (fieldValue === condition.not) return false;
        continue;
      }
    }

    if (fieldValue !== value) return false;
  }

  return true;
}

function createFindMany(rows: TestRow[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (args?: { where?: Record<string, unknown> }) => {
    return rows.filter((row) => matchesWhere(row, args?.where));
  });
}

function createFindUnique(rows: TestRow[]): ReturnType<typeof vi.fn> {
  return vi.fn(async (args: { where: { id: string } }) => {
    return rows.find((row) => row.id === args.where.id) ?? null;
  });
}

function createPrismaMock(
  seed: PrismaMockSeed = {},
  options?: {
    personaCreate?: ReturnType<typeof vi.fn>;
  }
) {
  const aliasClaims = seed.aliasClaims ?? [];
  const eventClaims = seed.eventClaims ?? [];
  const relationClaims = seed.relationClaims ?? [];
  const timeClaims = seed.timeClaims ?? [];
  const identityResolutionClaims = seed.identityResolutionClaims ?? [];
  const conflictFlags = seed.conflictFlags ?? [];
  const personaCreate = options?.personaCreate ?? vi.fn();

  return {
    aliasClaim             : { findUnique: createFindUnique(aliasClaims) },
    eventClaim             : { findUnique: createFindUnique(eventClaims) },
    relationClaim          : { findUnique: createFindUnique(relationClaims) },
    timeClaim              : { findUnique: createFindUnique(timeClaims), findMany: createFindMany(timeClaims) },
    identityResolutionClaim: {
      findUnique: createFindUnique(identityResolutionClaims),
      findMany  : createFindMany(identityResolutionClaims)
    },
    conflictFlag: { findUnique: createFindUnique(conflictFlags) },
    persona     : { create: personaCreate }
  };
}

function eventClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                        : EVENT_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID,
    subjectPersonaCandidateId : CANDIDATE_ID_1,
    objectPersonaCandidateId  : null,
    timeHintId                : null,
    relationTypeKey           : null,
    resolvedPersonaId         : null,
    relatedPersonaCandidateIds: [],
    relatedChapterIds         : [],
    normalizedLabel           : null,
    ...overrides
  };
}

function timeClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                        : TIME_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID,
    subjectPersonaCandidateId : null,
    objectPersonaCandidateId  : null,
    sourcePersonaCandidateId  : null,
    targetPersonaCandidateId  : null,
    personaCandidateId        : null,
    resolvedPersonaId         : null,
    relatedPersonaCandidateIds: [],
    relatedChapterIds         : [],
    normalizedLabel           : "官渡之战前后",
    relationTypeKey           : null,
    timeHintId                : null,
    ...overrides
  };
}

function relationClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                        : RELATION_ID_1,
    bookId                    : BOOK_ID,
    chapterId                 : CHAPTER_ID,
    sourceMentionId           : null,
    targetMentionId           : null,
    sourcePersonaCandidateId  : CANDIDATE_ID_1,
    targetPersonaCandidateId  : CANDIDATE_ID_2,
    relationTypeKey           : "friend_of",
    relationLabel             : "朋友",
    relationTypeSource        : "PRESET",
    direction                 : "FORWARD",
    effectiveChapterStart     : 1,
    effectiveChapterEnd       : 2,
    timeHintId                : null,
    evidenceSpanIds           : [EVIDENCE_ID_OLD],
    confidence                : 0.7,
    reviewState               : "ACCEPTED",
    source                    : "AI",
    runId                     : RUN_ID,
    supersedesClaimId         : null,
    derivedFromClaimId        : null,
    createdByUserId           : null,
    reviewedByUserId          : null,
    reviewNote                : null,
    relatedPersonaCandidateIds: [],
    relatedChapterIds         : [],
    normalizedLabel           : null,
    ...overrides
  };
}

function identityClaim(overrides: Partial<TestRow> = {}): TestRow {
  return {
    id                : IDENTITY_ID_1,
    bookId            : BOOK_ID,
    chapterId         : CHAPTER_ID,
    confidence        : 0.95,
    runId             : RUN_ID,
    mentionId         : MENTION_ID_1,
    personaCandidateId: CANDIDATE_ID_1,
    resolvedPersonaId : PERSONA_ID_1,
    resolutionKind    : IdentityResolutionKind.RESOLVES_TO,
    rationale         : "identity resolved",
    evidenceSpanIds   : [EVIDENCE_ID_1],
    reviewState       : "ACCEPTED",
    source            : "AI",
    supersedesClaimId : null,
    derivedFromClaimId: null,
    createdByUserId   : null,
    reviewedByUserId  : null,
    reviewNote        : null,
    ...overrides
  };
}

function createClaimRepositoryMock(input: {
  summary?     : ReviewableClaimSummary | null;
  createResult?: { id: string };
}) {
  const summary = input.summary ?? null;
  const repository = {} as ClaimRepository;
  const transactionSpy = vi.fn(
    async (work: (repository: ClaimRepository) => Promise<unknown>) => work(repository)
  );
  const transaction: ClaimRepository["transaction"] = async <T>(
    work: (repository: ClaimRepository) => Promise<T>
  ): Promise<T> => transactionSpy(work) as Promise<T>;
  const replaceClaimFamilyScopeImpl: ClaimRepository["replaceClaimFamilyScope"] = async (
    _scope
  ) => ({
    deletedCount: 0,
    createdCount: 0
  });
  const replaceClaimFamilyScope = vi.fn(replaceClaimFamilyScopeImpl);
  const findReviewableClaimSummary = vi.fn(
    async <TFamily extends ReviewableClaimFamily>(
      _family: TFamily,
      _claimId: string
    ): Promise<ReviewableClaimSummary | null> => summary
  );
  const updateReviewableClaimReviewState = vi.fn(
    async <TFamily extends ReviewableClaimFamily>(
      update: UpdateReviewableClaimReviewStateInput<TFamily>
    ): Promise<ReviewableClaimSummary> => ({
      id         : update.claimId,
      reviewState: update.reviewState,
      source     : summary?.source ?? "AI"
    })
  );
  const createReviewableClaimSpy = vi.fn(async (
    _family: ReviewableClaimFamily,
    data: ClaimCreateDataByFamily[ReviewableClaimFamily] & { reviewedAt?: Date | null }
  ) => {
    if (input.createResult === undefined) {
      throw new Error("createReviewableClaim should not be called in this test");
    }

    return {
      id: input.createResult.id,
      ...data
    };
  });
  const createReviewableClaim: ClaimRepository["createReviewableClaim"] = async <TFamily extends ReviewableClaimFamily>(
    family: TFamily,
    data: ClaimCreateDataByFamily[TFamily] & { reviewedAt?: Date | null }
  ) => createReviewableClaimSpy(
    family,
    data as unknown as ClaimCreateDataByFamily[ReviewableClaimFamily] & { reviewedAt?: Date | null }
  ) as unknown as Promise<{ id: string } & ClaimCreateDataByFamily[TFamily]>;

  Object.assign(repository, {
    transaction,
    replaceClaimFamilyScope,
    findReviewableClaimSummary,
    updateReviewableClaimReviewState,
    createReviewableClaim
  });

  return {
    repository,
    transaction          : transactionSpy,
    replaceClaimFamilyScope,
    findReviewableClaimSummary,
    updateReviewableClaimReviewState,
    createReviewableClaim: createReviewableClaimSpy
  };
}

describe("createReviewMutationService", () => {
  it("accepts an event claim, writes audit, and rebuilds affected persona scope", async () => {
    const claimRepositoryMock = createClaimRepositoryMock({
      summary: { id: EVENT_ID_1, reviewState: "PENDING", source: "AI" }
    });
    const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
    const auditService = { logClaimAction: vi.fn().mockResolvedValue(undefined) };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        eventClaims             : [eventClaim()],
        identityResolutionClaims: [identityClaim()]
      }) as never,
      claimRepository: claimRepositoryMock.repository,
      projectionBuilder,
      auditService
    });

    await service.applyClaimAction({
      bookId     : BOOK_ID,
      claimKind  : "EVENT",
      claimId    : EVENT_ID_1,
      action     : "ACCEPT",
      actorUserId: USER_ID,
      note       : "confirmed"
    });

    expect(claimRepositoryMock.updateReviewableClaimReviewState).toHaveBeenCalledWith(expect.objectContaining({
      family          : "EVENT",
      claimId         : EVENT_ID_1,
      reviewState     : "ACCEPTED",
      reviewedByUserId: USER_ID
    }));
    expect(auditService.logClaimAction).toHaveBeenCalledWith(expect.objectContaining({
      bookId     : BOOK_ID,
      claimKind  : ClaimKind.EVENT,
      claimId    : EVENT_ID_1,
      actorUserId: USER_ID,
      action     : ReviewAction.ACCEPT,
      beforeState: { reviewState: "PENDING", source: "AI" },
      afterState : { reviewState: "ACCEPTED" },
      note       : "confirmed"
    }));
    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledTimes(1);
    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: PERSONA_ID_1
    });
  });

  it("defers a time claim and falls back to time-slice rebuild when persona is unresolved", async () => {
    const claimRepositoryMock = createClaimRepositoryMock({
      summary: { id: TIME_ID_1, reviewState: "PENDING", source: "AI" }
    });
    const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
    const auditService = { logClaimAction: vi.fn().mockResolvedValue(undefined) };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        timeClaims: [timeClaim({ id: TIME_ID_1, normalizedLabel: "官渡之战前后" })]
      }) as never,
      claimRepository: claimRepositoryMock.repository,
      projectionBuilder,
      auditService
    });

    await service.applyClaimAction({
      bookId     : BOOK_ID,
      claimKind  : "TIME",
      claimId    : TIME_ID_1,
      action     : "DEFER",
      actorUserId: USER_ID,
      note       : "needs chronology review"
    });

    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledTimes(1);
    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
      kind     : "TIME_SLICE",
      bookId   : BOOK_ID,
      timeLabel: "官渡之战前后"
    });
  });

  it("falls back to chapter rebuild when accepted identity mapping is ambiguous", async () => {
    const claimRepositoryMock = createClaimRepositoryMock({
      summary: { id: EVENT_ID_1, reviewState: "PENDING", source: "AI" }
    });
    const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
    const auditService = { logClaimAction: vi.fn().mockResolvedValue(undefined) };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        eventClaims             : [eventClaim()],
        identityResolutionClaims: [
          identityClaim({ resolvedPersonaId: PERSONA_ID_1 }),
          identityClaim({
            id               : "78787878-7878-4787-8787-787878787878",
            resolvedPersonaId: PERSONA_ID_2
          })
        ]
      }) as never,
      claimRepository: claimRepositoryMock.repository,
      projectionBuilder,
      auditService
    });

    await service.applyClaimAction({
      bookId     : BOOK_ID,
      claimKind  : "EVENT",
      claimId    : EVENT_ID_1,
      action     : "ACCEPT",
      actorUserId: USER_ID
    });

    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledTimes(1);
    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledWith({
      kind     : "CHAPTER",
      bookId   : BOOK_ID,
      chapterId: CHAPTER_ID
    });
  });

  it("rejects illegal review-state transitions before writing audit rows", async () => {
    const claimRepositoryMock = createClaimRepositoryMock({
      summary: { id: EVENT_ID_1, reviewState: "REJECTED", source: "AI" }
    });
    const auditService = { logClaimAction: vi.fn() };
    const projectionBuilder = { rebuildProjection: vi.fn() };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        eventClaims: [eventClaim({ id: EVENT_ID_1, bookId: BOOK_ID })]
      }) as never,
      claimRepository: claimRepositoryMock.repository,
      projectionBuilder,
      auditService
    });

    await expect(service.applyClaimAction({
      bookId     : BOOK_ID,
      claimKind  : "EVENT",
      claimId    : EVENT_ID_1,
      action     : "ACCEPT",
      actorUserId: USER_ID
    })).rejects.toThrow("cannot transition");

    expect(claimRepositoryMock.updateReviewableClaimReviewState).not.toHaveBeenCalled();
    expect(auditService.logClaimAction).not.toHaveBeenCalled();
    expect(projectionBuilder.rebuildProjection).not.toHaveBeenCalled();
  });

  it("rejects claim actions when the route bookId does not own the target claim", async () => {
    const claimRepositoryMock = createClaimRepositoryMock({
      summary: { id: EVENT_ID_1, reviewState: "PENDING", source: "AI" }
    });
    const auditService = { logClaimAction: vi.fn() };
    const projectionBuilder = { rebuildProjection: vi.fn() };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        eventClaims: [eventClaim({ id: EVENT_ID_1, bookId: BOOK_ID })]
      }) as never,
      claimRepository: claimRepositoryMock.repository,
      projectionBuilder,
      auditService
    });

    await expect(service.applyClaimAction({
      bookId     : OTHER_BOOK_ID,
      claimKind  : "EVENT",
      claimId    : EVENT_ID_1,
      action     : "ACCEPT",
      actorUserId: USER_ID
    })).rejects.toThrow(`Reviewable claim EVENT:${EVENT_ID_1} not found`);

    expect(claimRepositoryMock.updateReviewableClaimReviewState).not.toHaveBeenCalled();
    expect(auditService.logClaimAction).not.toHaveBeenCalled();
    expect(projectionBuilder.rebuildProjection).not.toHaveBeenCalled();
  });

  it("edits an event claim by creating an accepted MANUAL override and marking the original as EDITED", async () => {
    const createManualOverride = vi.fn().mockResolvedValue({
      originalClaimId: EVENT_ID_1,
      manualClaimId  : MANUAL_EVENT_ID
    });
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        eventClaims: [eventClaim({ id: EVENT_ID_1 })]
      }) as never,
      claimRepository: createClaimRepositoryMock({
        summary: { id: EVENT_ID_1, reviewState: "PENDING", source: "AI" }
      }).repository,
      projectionBuilder    : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
      auditService         : { logClaimAction: vi.fn().mockResolvedValue(undefined) },
      manualOverrideService: { createManualOverride }
    });

    await service.editClaim({
      bookId     : BOOK_ID,
      claimKind  : "EVENT",
      claimId    : EVENT_ID_1,
      actorUserId: USER_ID,
      note       : "fix predicate",
      draft      : {
        bookId                   : BOOK_ID,
        chapterId                : CHAPTER_ID,
        confidence               : 1,
        runId                    : RUN_ID,
        subjectMentionId         : null,
        subjectPersonaCandidateId: CANDIDATE_ID_1,
        predicate                : "中举",
        objectText               : null,
        objectPersonaCandidateId : null,
        locationText             : null,
        timeHintId               : null,
        eventCategory            : BioCategory.EXAM,
        narrativeLens            : NarrativeLens.SELF,
        evidenceSpanIds          : [EVIDENCE_ID_1]
      }
    });

    expect(createManualOverride).toHaveBeenCalledWith(expect.objectContaining({
      family         : "EVENT",
      originalClaimId: EVENT_ID_1,
      actorUserId    : USER_ID
    }));
  });

  it("creates standalone accepted MANUAL relation claims with custom relationTypeKey strings", async () => {
    const claimRepositoryMock = createClaimRepositoryMock({
      createResult: { id: MANUAL_RELATION_ID }
    });
    const service = createReviewMutationService({
      prismaClient     : createPrismaMock() as never,
      claimRepository  : claimRepositoryMock.repository,
      projectionBuilder: { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
      auditService     : { logClaimAction: vi.fn().mockResolvedValue(undefined) }
    });

    await service.createManualClaim({
      claimKind  : "RELATION",
      actorUserId: USER_ID,
      note       : "作品自定义关系",
      draft      : {
        bookId                  : BOOK_ID,
        chapterId               : CHAPTER_ID,
        confidence              : 1,
        runId                   : RUN_ID,
        sourceMentionId         : null,
        targetMentionId         : null,
        sourcePersonaCandidateId: CANDIDATE_ID_1,
        targetPersonaCandidateId: CANDIDATE_ID_2,
        relationTypeKey         : "mentor_of",
        relationLabel           : "提携",
        relationTypeSource      : "CUSTOM",
        direction               : "FORWARD",
        effectiveChapterStart   : 1,
        effectiveChapterEnd     : 3,
        timeHintId              : null,
        evidenceSpanIds         : [EVIDENCE_ID_1]
      }
    });

    expect(claimRepositoryMock.createReviewableClaim).toHaveBeenCalledWith("RELATION", expect.objectContaining({
      source          : "MANUAL",
      reviewState     : "ACCEPTED",
      relationTypeKey : "mentor_of",
      createdByUserId : USER_ID,
      reviewedByUserId: USER_ID
    }));
  });

  it("relinks evidence by cloning the original claim into a MANUAL override instead of mutating AI evidence", async () => {
    const createManualOverride = vi.fn().mockResolvedValue({
      originalClaimId: RELATION_ID_1,
      manualClaimId  : MANUAL_RELATION_ID
    });
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        relationClaims: [relationClaim({ id: RELATION_ID_1, evidenceSpanIds: [EVIDENCE_ID_OLD] })]
      }) as never,
      claimRepository: createClaimRepositoryMock({
        summary: { id: RELATION_ID_1, reviewState: "ACCEPTED", source: "AI" }
      }).repository,
      projectionBuilder    : { rebuildProjection: vi.fn().mockResolvedValue(undefined) },
      auditService         : { logClaimAction: vi.fn().mockResolvedValue(undefined) },
      manualOverrideService: { createManualOverride }
    });

    await service.relinkEvidence({
      bookId         : BOOK_ID,
      claimKind      : "RELATION",
      claimId        : RELATION_ID_1,
      actorUserId    : USER_ID,
      note           : "more precise evidence",
      evidenceSpanIds: [EVIDENCE_ID_NEW]
    });

    expect(createManualOverride).toHaveBeenCalledWith(expect.objectContaining({
      family: "RELATION",
      draft : expect.objectContaining({
        evidenceSpanIds: [EVIDENCE_ID_NEW]
      })
    }));
  });

  it("merges persona candidates by writing MANUAL identity-resolution overrides instead of mutating legacy truth only", async () => {
    const createManualOverride = vi.fn()
      .mockResolvedValueOnce({
        originalClaimId: IDENTITY_ID_1,
        manualClaimId  : MANUAL_IDENTITY_ID_1
      })
      .mockResolvedValueOnce({
        originalClaimId: IDENTITY_ID_2,
        manualClaimId  : MANUAL_IDENTITY_ID_2
      });
    const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
    const auditService = { logClaimAction: vi.fn(), logPersonaAction: vi.fn().mockResolvedValue(undefined) };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        identityResolutionClaims: [
          identityClaim({
            id                : IDENTITY_ID_1,
            mentionId         : MENTION_ID_1,
            personaCandidateId: CANDIDATE_ID_1,
            resolvedPersonaId : SOURCE_PERSONA_ID
          }),
          identityClaim({
            id                : IDENTITY_ID_2,
            mentionId         : MENTION_ID_2,
            personaCandidateId: CANDIDATE_ID_2,
            resolvedPersonaId : SOURCE_PERSONA_ID
          })
        ]
      }) as never,
      claimRepository      : createClaimRepositoryMock({}).repository,
      projectionBuilder,
      auditService,
      manualOverrideService: { createManualOverride }
    });

    await service.mergePersona({
      bookId             : BOOK_ID,
      sourcePersonaId    : SOURCE_PERSONA_ID,
      targetPersonaId    : TARGET_PERSONA_ID,
      personaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2],
      actorUserId        : USER_ID,
      note               : "same historical person"
    });

    expect(createManualOverride).toHaveBeenCalledTimes(2);
    expect(createManualOverride).toHaveBeenNthCalledWith(1, expect.objectContaining({
      family         : "IDENTITY_RESOLUTION",
      originalClaimId: IDENTITY_ID_1,
      actorUserId    : USER_ID,
      reviewNote     : "same historical person",
      draft          : expect.objectContaining({
        mentionId         : MENTION_ID_1,
        personaCandidateId: CANDIDATE_ID_1,
        resolvedPersonaId : TARGET_PERSONA_ID,
        resolutionKind    : IdentityResolutionKind.MERGE_INTO,
        evidenceSpanIds   : [EVIDENCE_ID_1],
        runId             : RUN_ID
      })
    }));
    expect(auditService.logPersonaAction).toHaveBeenCalledWith(expect.objectContaining({
      bookId     : BOOK_ID,
      personaId  : TARGET_PERSONA_ID,
      actorUserId: USER_ID,
      action     : ReviewAction.MERGE_PERSONA,
      beforeState: {
        sourcePersonaId    : SOURCE_PERSONA_ID,
        personaCandidateIds: [CANDIDATE_ID_1, CANDIDATE_ID_2]
      },
      afterState: { targetPersonaId: TARGET_PERSONA_ID },
      note      : "same historical person"
    }));
    expect(projectionBuilder.rebuildProjection).toHaveBeenCalledTimes(2);
    expect(projectionBuilder.rebuildProjection).toHaveBeenNthCalledWith(1, {
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: SOURCE_PERSONA_ID
    });
    expect(projectionBuilder.rebuildProjection).toHaveBeenNthCalledWith(2, {
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: TARGET_PERSONA_ID
    });
  });

  it("splits selected candidates into a new persona row and writes MANUAL identity claims to the new persona id", async () => {
    const personaCreate = vi.fn().mockResolvedValue({
      id  : NEW_PERSONA_ID,
      name: "新角色"
    });
    const createManualOverride = vi.fn().mockResolvedValue({
      originalClaimId: IDENTITY_ID_3,
      manualClaimId  : MANUAL_IDENTITY_ID_3
    });
    const projectionBuilder = { rebuildProjection: vi.fn().mockResolvedValue(undefined) };
    const auditService = { logClaimAction: vi.fn(), logPersonaAction: vi.fn().mockResolvedValue(undefined) };
    const service = createReviewMutationService({
      prismaClient: createPrismaMock({
        identityResolutionClaims: [identityClaim({
          id                : IDENTITY_ID_3,
          mentionId         : MENTION_ID_3,
          personaCandidateId: CANDIDATE_ID_3,
          resolvedPersonaId : SOURCE_PERSONA_ID
        })]
      }, { personaCreate }) as never,
      claimRepository      : createClaimRepositoryMock({}).repository,
      projectionBuilder,
      auditService,
      manualOverrideService: { createManualOverride }
    });

    const result = await service.splitPersona({
      bookId         : BOOK_ID,
      sourcePersonaId: SOURCE_PERSONA_ID,
      splitTargets   : [{
        targetPersonaName  : "新角色",
        personaCandidateIds: [CANDIDATE_ID_3]
      }],
      actorUserId: USER_ID,
      note       : "different person after all"
    });

    expect(personaCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        name        : "新角色",
        recordSource: "MANUAL",
        confidence  : 1,
        status      : "CONFIRMED"
      })
    }));
    expect(result).toEqual({ createdPersonaIds: [NEW_PERSONA_ID] });
    expect(createManualOverride).toHaveBeenCalledWith(expect.objectContaining({
      family         : "IDENTITY_RESOLUTION",
      originalClaimId: IDENTITY_ID_3,
      actorUserId    : USER_ID,
      draft          : expect.objectContaining({
        mentionId         : MENTION_ID_3,
        personaCandidateId: CANDIDATE_ID_3,
        resolvedPersonaId : NEW_PERSONA_ID,
        resolutionKind    : IdentityResolutionKind.SPLIT_FROM,
        evidenceSpanIds   : [EVIDENCE_ID_1],
        runId             : RUN_ID
      })
    }));
    expect(projectionBuilder.rebuildProjection).toHaveBeenNthCalledWith(1, {
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: NEW_PERSONA_ID
    });
    expect(projectionBuilder.rebuildProjection).toHaveBeenNthCalledWith(2, {
      kind     : "PERSONA",
      bookId   : BOOK_ID,
      personaId: SOURCE_PERSONA_ID
    });
    expect(auditService.logPersonaAction).toHaveBeenCalledWith(expect.objectContaining({
      bookId     : BOOK_ID,
      personaId  : SOURCE_PERSONA_ID,
      actorUserId: USER_ID,
      action     : ReviewAction.SPLIT_PERSONA,
      beforeState: { sourcePersonaId: SOURCE_PERSONA_ID },
      afterState : {
        splitTargets: [{
          targetPersonaName  : "新角色",
          personaCandidateIds: [CANDIDATE_ID_3]
        }],
        createdPersonaIds: [NEW_PERSONA_ID]
      },
      note: "different person after all"
    }));
  });
});
