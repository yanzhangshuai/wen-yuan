import { describe, expect, it, vi } from "vitest";

import {
  runReviewRegressionActionScenarios,
  type ReviewRegressionActionHarnessMutationServiceFactoryInput,
  type ReviewRegressionActionHarnessPrismaClient
} from "./review-action-harness";
import type {
  ReviewRegressionActionScenario,
  ReviewRegressionFixture
} from "./contracts";
import type { ReviewRegressionSnapshotFixtureContext } from "./snapshot-repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "44444444-4444-4444-8444-444444444444";
const PERSONA_ID_1 = "55555555-5555-4555-8555-555555555555";
const PERSONA_ID_2 = "56565656-5656-4565-8565-565656565656";
const CANDIDATE_ID_1 = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID_2 = "67676767-6767-4676-8676-676767676767";
const CANDIDATE_ID_3 = "68686868-6868-4686-8686-686868686868";
const EVENT_CLAIM_ID = "77777777-7777-4777-8777-777777777777";
const RELATION_CLAIM_ID = "78787878-7878-4787-8787-787878787878";
const TIME_CLAIM_ID = "79797979-7979-4797-8797-797979797979";
const IDENTITY_CLAIM_ID_1 = "80808080-8080-4080-8080-808080808080";
const IDENTITY_CLAIM_ID_2 = "81818181-8181-4181-8181-818181818181";
const IDENTITY_CLAIM_ID_3 = "82828282-8282-4282-8282-828282828282";
const EVIDENCE_EVENT_ID = "90909090-9090-4909-8909-909090909090";
const EVIDENCE_RELATION_ID = "91919191-9191-4919-8919-919191919191";
const EVIDENCE_TIME_ID = "92929292-9292-4929-8929-929292929292";
const EVIDENCE_SPLIT_ID = "93939393-9393-4939-8939-939393939393";
const NOW = new Date("2026-04-23T08:00:00.000Z");
type PersonaTestRow = {
  id       : string;
  name     : string;
  aliases  : string[];
  deletedAt: null;
};
type PersonaAliasTestRow = {
  personaId: string;
  aliasText: string;
};
type EvidenceSpanTestRow = {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  quotedText         : string;
  normalizedText     : string;
  narrativeRegionType: string;
};
type IdentityResolutionClaimTestRow = {
  id                : string;
  bookId            : string;
  chapterId         : string | null;
  mentionId         : string;
  personaCandidateId: string | null;
  resolvedPersonaId : string | null;
  resolutionKind    : string;
  rationale         : string | null;
  evidenceSpanIds   : string[];
  confidence        : number;
  reviewState       : string;
  source            : string;
  runId             : string;
};
type EventClaimTestRow = {
  id                       : string;
  bookId                   : string;
  chapterId                : string;
  subjectMentionId         : string | null;
  subjectPersonaCandidateId: string | null;
  predicate                : string;
  objectText               : string | null;
  objectPersonaCandidateId : string | null;
  locationText             : string | null;
  timeHintId               : string | null;
  eventCategory            : string;
  narrativeLens            : string;
  evidenceSpanIds          : string[];
  confidence               : number;
  reviewState              : string;
  source                   : string;
  runId                    : string;
};
type RelationClaimTestRow = {
  id                      : string;
  bookId                  : string;
  chapterId               : string;
  sourceMentionId         : string | null;
  targetMentionId         : string | null;
  sourcePersonaCandidateId: string | null;
  targetPersonaCandidateId: string | null;
  relationTypeKey         : string;
  relationLabel           : string;
  relationTypeSource      : string;
  direction               : string;
  effectiveChapterStart   : number | null;
  effectiveChapterEnd     : number | null;
  timeHintId              : string | null;
  evidenceSpanIds         : string[];
  confidence              : number;
  reviewState             : string;
  source                  : string;
  runId                   : string;
};
type TimeClaimTestRow = {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  rawTimeText        : string;
  timeType           : string;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
  evidenceSpanIds    : string[];
  confidence         : number;
  reviewState        : string;
  source             : string;
  runId              : string;
};

const fixture: ReviewRegressionFixture = {
  fixtureKey   : "rulin-waishi",
  bookTitle    : "儒林外史",
  chapterRange : { startNo: 3, endNo: 3 },
  personas     : [],
  chapterFacts : [],
  relations    : [],
  timeFacts    : [],
  reviewActions: [],
  rerunSamples : []
};

const context: ReviewRegressionSnapshotFixtureContext = {
  fixture,
  book    : { id: BOOK_ID, title: "儒林外史" },
  chapters: [{ id: CHAPTER_ID, bookId: BOOK_ID, no: 3, title: "第三回", content: "第三回正文" }]
};

function actionScenarios(): ReviewRegressionActionScenario[] {
  return [
    {
      scenarioKey: "accept-fan-jin-event",
      action     : "ACCEPT_CLAIM",
      target     : {
        claimKind      : "EVENT",
        chapterNo      : 3,
        personaName    : "范进",
        evidenceSnippet: "范进中举"
      },
      expected: { auditAction: "ACCEPT", projectionFamilies: ["persona_chapter_facts"] }
    },
    {
      scenarioKey: "reject-mentor-relation",
      action     : "REJECT_CLAIM",
      target     : {
        claimKind: "RELATION",
        chapterNo: 3,
        pair     : {
          sourcePersonaName: "范进",
          targetPersonaName: "周进",
          relationTypeKey  : "mentor.custom"
        },
        evidenceSnippet: "周进提携范进"
      },
      expected: { auditAction: "REJECT", projectionFamilies: ["persona_chapter_facts"] }
    },
    {
      scenarioKey: "defer-later-time",
      action     : "DEFER_CLAIM",
      target     : {
        claimKind      : "TIME",
        chapterNo      : 3,
        evidenceSnippet: "后来"
      },
      expected: { auditAction: "DEFER", projectionFamilies: ["persona_chapter_facts"] }
    },
    {
      scenarioKey: "edit-mentor-relation",
      action     : "EDIT_CLAIM",
      target     : {
        claimKind: "RELATION",
        chapterNo: 3,
        pair     : {
          sourcePersonaName: "范进",
          targetPersonaName: "周进",
          relationTypeKey  : "mentor.custom"
        },
        evidenceSnippet: "周进提携范进"
      },
      expected: { auditAction: "EDIT", projectionFamilies: ["relationship_edges"] }
    },
    {
      scenarioKey: "create-manual-mentor-relation",
      action     : "CREATE_MANUAL_CLAIM",
      target     : {
        claimKind: "RELATION",
        chapterNo: 3,
        pair     : {
          sourcePersonaName: "范进",
          targetPersonaName: "周进",
          relationTypeKey  : "mentor.custom"
        },
        evidenceSnippet: "周进提携范进"
      },
      expected: { auditAction: "CREATE_MANUAL_CLAIM", projectionFamilies: ["relationship_edges"] }
    },
    {
      scenarioKey: "relink-mentor-relation-evidence",
      action     : "RELINK_EVIDENCE",
      target     : {
        claimKind: "RELATION",
        chapterNo: 3,
        pair     : {
          sourcePersonaName: "范进",
          targetPersonaName: "周进",
          relationTypeKey  : "mentor.custom"
        },
        evidenceSnippet: "周进提携范进"
      },
      expected: { auditAction: "RELINK_EVIDENCE", projectionFamilies: ["relationship_edges"] }
    },
    {
      scenarioKey: "merge-fan-jin-into-zhou-jin",
      action     : "MERGE_PERSONA",
      target     : {
        claimKind: "IDENTITY",
        chapterNo: 3,
        pair     : {
          sourcePersonaName: "范进",
          targetPersonaName: "周进"
        },
        evidenceSnippet: "范进中举"
      },
      expected: { auditAction: "MERGE_PERSONA", projectionFamilies: ["relationship_edges"] }
    },
    {
      scenarioKey: "split-fan-jin-pressure-case",
      action     : "SPLIT_PERSONA",
      target     : {
        claimKind: "IDENTITY",
        chapterNo: 3,
        pair     : {
          sourcePersonaName: "范进",
          targetPersonaName: "范进误认分身"
        },
        evidenceSnippet: "误认范进"
      },
      expected: { auditAction: "SPLIT_PERSONA", projectionFamilies: ["relationship_edges"] }
    }
  ];
}

function createPrismaMock() {
  const seed = {
    personas: [
      { id: PERSONA_ID_1, name: "范进", aliases: ["范举人"], deletedAt: null },
      { id: PERSONA_ID_2, name: "周进", aliases: ["周学道"], deletedAt: null }
    ] satisfies PersonaTestRow[],
    personaAliases: [
      { personaId: PERSONA_ID_1, aliasText: "范老爷" },
      { personaId: PERSONA_ID_2, aliasText: "周学道" }
    ] satisfies PersonaAliasTestRow[],
    evidenceSpans: [
      evidenceSpan(EVIDENCE_EVENT_ID, "范进中举，众人改口称老爷"),
      evidenceSpan(EVIDENCE_RELATION_ID, "周进提携范进，二人有师生之谊"),
      evidenceSpan(EVIDENCE_TIME_ID, "后来范进又入京"),
      evidenceSpan(EVIDENCE_SPLIT_ID, "此处误认范进，疑为另一人")
    ] satisfies EvidenceSpanTestRow[],
    identityResolutionClaims: [
      identityClaim({
        id                : IDENTITY_CLAIM_ID_1,
        personaCandidateId: CANDIDATE_ID_1,
        resolvedPersonaId : PERSONA_ID_1,
        evidenceSpanIds   : [EVIDENCE_EVENT_ID]
      }),
      identityClaim({
        id                : IDENTITY_CLAIM_ID_2,
        personaCandidateId: CANDIDATE_ID_2,
        resolvedPersonaId : PERSONA_ID_2,
        evidenceSpanIds   : [EVIDENCE_RELATION_ID]
      }),
      identityClaim({
        id                : IDENTITY_CLAIM_ID_3,
        personaCandidateId: CANDIDATE_ID_3,
        resolvedPersonaId : PERSONA_ID_1,
        evidenceSpanIds   : [EVIDENCE_SPLIT_ID]
      })
    ] satisfies IdentityResolutionClaimTestRow[],
    eventClaims   : [eventClaim()] satisfies EventClaimTestRow[],
    relationClaims: [relationClaim()] satisfies RelationClaimTestRow[],
    timeClaims    : [timeClaim()] satisfies TimeClaimTestRow[]
  };

  const delegates = {
    persona                : { findMany: createFindMany(seed.personas), findFirst: createFindFirst(seed.personas) },
    personaAlias           : { findMany: createFindMany(seed.personaAliases) },
    evidenceSpan           : { findMany: createFindMany(seed.evidenceSpans) },
    identityResolutionClaim: {
      findMany  : createFindMany(seed.identityResolutionClaims),
      findUnique: createFindUnique(seed.identityResolutionClaims)
    },
    eventClaim: {
      findMany  : createFindMany(seed.eventClaims),
      findUnique: createFindUnique(seed.eventClaims)
    },
    relationClaim: {
      findMany  : createFindMany(seed.relationClaims),
      findUnique: createFindUnique(seed.relationClaims)
    },
    timeClaim: {
      findMany  : createFindMany(seed.timeClaims),
      findUnique: createFindUnique(seed.timeClaims)
    },
    aliasClaim  : { findUnique: createFindUnique([]) },
    conflictFlag: { findUnique: createFindUnique([]) }
  };
  const txClient = { ...delegates, transactionMarker: "tx-client" };
  const rollbackErrors: unknown[] = [];
  const prismaClient = {
    ...delegates,
    $transaction: vi.fn(async (callback: (tx: typeof txClient) => Promise<unknown>) => {
      try {
        return await callback(txClient);
      } catch (error) {
        rollbackErrors.push(error);
        throw error;
      }
    })
  };

  return {
    prismaClient: prismaClient as unknown as ReviewRegressionActionHarnessPrismaClient,
    txClient,
    rollbackErrors
  };
}

function createFindMany<TRow>(rows: readonly TRow[]) {
  return vi.fn(async () => rows);
}

function createFindFirst<TRow>(rows: readonly TRow[]) {
  return vi.fn(async () => rows[0] ?? null);
}

function createFindUnique<TRow extends { id: string }>(rows: readonly TRow[]) {
  return vi.fn(async (args: { where: { id: string } }) => rows.find((row) => row.id === args.where.id) ?? null);
}

function evidenceSpan(id: string, quotedText: string): EvidenceSpanTestRow {
  return {
    id,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    quotedText,
    normalizedText     : quotedText,
    narrativeRegionType: "NARRATION"
  };
}

function identityClaim(
  overrides: Partial<IdentityResolutionClaimTestRow>
): IdentityResolutionClaimTestRow {
  return {
    id                : IDENTITY_CLAIM_ID_1,
    bookId            : BOOK_ID,
    chapterId         : CHAPTER_ID,
    mentionId         : "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    personaCandidateId: CANDIDATE_ID_1,
    resolvedPersonaId : PERSONA_ID_1,
    resolutionKind    : "RESOLVES_TO",
    rationale         : "same person",
    evidenceSpanIds   : [EVIDENCE_EVENT_ID],
    confidence        : 0.9,
    reviewState       : "ACCEPTED",
    source            : "AI",
    runId             : RUN_ID,
    ...overrides
  };
}

function eventClaim(): EventClaimTestRow {
  return {
    id                       : EVENT_CLAIM_ID,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID,
    subjectMentionId         : null,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    predicate                : "中举",
    objectText               : null,
    objectPersonaCandidateId : null,
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EXAM",
    narrativeLens            : "SELF",
    evidenceSpanIds          : [EVIDENCE_EVENT_ID],
    confidence               : 0.9,
    reviewState              : "PENDING",
    source                   : "AI",
    runId                    : RUN_ID
  };
}

function relationClaim(): RelationClaimTestRow {
  return {
    id                      : RELATION_CLAIM_ID,
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: CANDIDATE_ID_1,
    targetPersonaCandidateId: CANDIDATE_ID_2,
    relationTypeKey         : "mentor.custom",
    relationLabel           : "师生",
    relationTypeSource      : "CUSTOM",
    direction               : "FORWARD",
    effectiveChapterStart   : 3,
    effectiveChapterEnd     : 3,
    timeHintId              : null,
    evidenceSpanIds         : [EVIDENCE_RELATION_ID],
    confidence              : 0.8,
    reviewState             : "PENDING",
    source                  : "AI",
    runId                   : RUN_ID
  };
}

function timeClaim(): TimeClaimTestRow {
  return {
    id                 : TIME_CLAIM_ID,
    bookId             : BOOK_ID,
    chapterId          : CHAPTER_ID,
    rawTimeText        : "后来",
    timeType           : "RELATIVE_PHASE",
    normalizedLabel    : "后来",
    relativeOrderWeight: 10,
    chapterRangeStart  : 3,
    chapterRangeEnd    : 3,
    evidenceSpanIds    : [EVIDENCE_TIME_ID],
    confidence         : 0.7,
    reviewState        : "PENDING",
    source             : "AI",
    runId              : RUN_ID
  };
}

describe("runReviewRegressionActionScenarios", () => {
  it("routes all supported actions through mutation services using natural keys and forced rollback", async () => {
    const { prismaClient, rollbackErrors } = createPrismaMock();
    const methodCalls: Array<{ method: string; input: unknown }> = [];
    const mutationServiceFactory = vi.fn((input: ReviewRegressionActionHarnessMutationServiceFactoryInput) => {
      expect(input.prismaClient).toMatchObject({ transactionMarker: "tx-client" });

      return createMutationServiceSpy(input, methodCalls);
    });

    const result = await runReviewRegressionActionScenarios({
      context    : { ...context, fixture: { ...fixture, reviewActions: actionScenarios() } },
      prismaClient,
      actorUserId: USER_ID,
      now        : () => NOW,
      mutationServiceFactory
    });

    expect(result.passed).toBe(8);
    expect(result.failed).toBe(0);
    expect(result.scenarioResults).toHaveLength(8);
    expect(result.scenarioResults.map((scenarioResult) => scenarioResult.auditAction)).toEqual([
      "ACCEPT",
      "REJECT",
      "DEFER",
      "EDIT",
      "CREATE_MANUAL_CLAIM",
      "RELINK_EVIDENCE",
      "MERGE_PERSONA",
      "SPLIT_PERSONA"
    ]);
    expect(methodCalls.map((call) => call.method)).toEqual([
      "applyClaimAction",
      "applyClaimAction",
      "applyClaimAction",
      "editClaim",
      "createManualClaim",
      "relinkEvidence",
      "mergePersona",
      "splitPersona"
    ]);
    expect(methodCalls[0]?.input).toMatchObject({
      bookId     : BOOK_ID,
      claimKind  : "EVENT",
      claimId    : EVENT_CLAIM_ID,
      action     : "ACCEPT",
      actorUserId: USER_ID
    });
    expect(methodCalls[1]?.input).toMatchObject({
      bookId   : BOOK_ID,
      claimKind: "RELATION",
      claimId  : RELATION_CLAIM_ID,
      action   : "REJECT"
    });
    expect(methodCalls[2]?.input).toMatchObject({
      bookId   : BOOK_ID,
      claimKind: "TIME",
      claimId  : TIME_CLAIM_ID,
      action   : "DEFER"
    });
    expect(methodCalls[4]?.input).toMatchObject({
      claimKind: "RELATION",
      draft    : expect.objectContaining({
        bookId            : BOOK_ID,
        relationTypeKey   : "mentor.custom",
        relationTypeSource: "CUSTOM"
      })
    });
    expect(methodCalls[6]?.input).toMatchObject({
      bookId             : BOOK_ID,
      sourcePersonaId    : PERSONA_ID_1,
      targetPersonaId    : PERSONA_ID_2,
      personaCandidateIds: [CANDIDATE_ID_1]
    });
    expect(methodCalls[7]?.input).toMatchObject({
      bookId         : BOOK_ID,
      sourcePersonaId: PERSONA_ID_1,
      splitTargets   : [{
        targetPersonaName  : "范进误认分身",
        personaCandidateIds: [CANDIDATE_ID_3]
      }]
    });
    expect(prismaClient.$transaction).toHaveBeenCalledTimes(8);
    expect(rollbackErrors).toHaveLength(8);
    expect(rollbackErrors.every((error) => error instanceof Error && error.name === "ReviewRegressionRollbackError"))
      .toBe(true);
  });

  it("returns a stable failed scenario result when a natural-key target cannot be resolved", async () => {
    const { prismaClient, rollbackErrors } = createPrismaMock();
    const methodCalls: Array<{ method: string; input: unknown }> = [];
    const missingTargetScenario: ReviewRegressionActionScenario = {
      scenarioKey: "accept-missing-event",
      action     : "ACCEPT_CLAIM",
      target     : {
        claimKind      : "EVENT",
        chapterNo      : 3,
        personaName    : "不存在",
        evidenceSnippet: "不存在的证据"
      },
      expected: { auditAction: "ACCEPT", projectionFamilies: ["persona_chapter_facts"] }
    };

    const result = await runReviewRegressionActionScenarios({
      context               : { ...context, fixture: { ...fixture, reviewActions: [missingTargetScenario] } },
      prismaClient,
      actorUserId           : USER_ID,
      now                   : () => NOW,
      mutationServiceFactory: (input) => createMutationServiceSpy(input, methodCalls)
    });

    expect(result).toEqual({
      passed         : 0,
      failed         : 1,
      scenarioResults: [{
        scenarioKey: "accept-missing-event",
        passed     : false,
        message    : "Target claim not found for scenario accept-missing-event",
        auditAction: null
      }]
    });
    expect(methodCalls).toEqual([]);
    expect(prismaClient.$transaction).toHaveBeenCalledTimes(1);
    expect(rollbackErrors).toHaveLength(1);
    expect(rollbackErrors[0]).toMatchObject({ name: "ReviewRegressionRollbackError" });
  });

  it("marks successful mutations as failed when expected audit or projection signals are missing", async () => {
    const { prismaClient } = createPrismaMock();
    const scenario = actionScenarios()[0];
    if (scenario === undefined) throw new Error("missing scenario fixture");

    const result = await runReviewRegressionActionScenarios({
      context               : { ...context, fixture: { ...fixture, reviewActions: [scenario] } },
      prismaClient,
      actorUserId           : USER_ID,
      now                   : () => NOW,
      mutationServiceFactory: () => ({
        applyClaimAction : vi.fn().mockResolvedValue(undefined),
        createManualClaim: vi.fn().mockResolvedValue(undefined),
        editClaim        : vi.fn().mockResolvedValue(undefined),
        relinkEvidence   : vi.fn().mockResolvedValue(undefined),
        mergePersona     : vi.fn().mockResolvedValue(undefined),
        splitPersona     : vi.fn().mockResolvedValue(undefined)
      })
    });

    expect(result.passed).toBe(0);
    expect(result.failed).toBe(1);
    expect(result.scenarioResults[0]).toEqual({
      scenarioKey: "accept-fan-jin-event",
      passed     : false,
      message    : "Expected audit action ACCEPT was not emitted",
      auditAction: null
    });
  });

  it("prefers personas that are actually referenced by fixture identity claims when global duplicate names exist", async () => {
    const { prismaClient } = createPrismaMock();
    const duplicatePersonaId = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
    const duplicateCandidateId = "bbbbbbbb-cccc-4ddd-8eee-ffffffffffff";

    prismaClient.persona.findMany = vi.fn(async (): Promise<PersonaTestRow[]> => [
      { id: duplicatePersonaId, name: "范进", aliases: ["范老爷"], deletedAt: null },
      { id: PERSONA_ID_1, name: "范进", aliases: ["范举人"], deletedAt: null },
      { id: PERSONA_ID_2, name: "周进", aliases: ["周学道"], deletedAt: null }
    ]);
    prismaClient.identityResolutionClaim.findMany = vi.fn(async (): Promise<IdentityResolutionClaimTestRow[]> => [
      identityClaim({
        id                : "99999999-0000-4000-8000-000000000001",
        personaCandidateId: duplicateCandidateId,
        resolvedPersonaId : duplicatePersonaId,
        evidenceSpanIds   : [EVIDENCE_EVENT_ID]
      }),
      identityClaim({
        id                : IDENTITY_CLAIM_ID_1,
        personaCandidateId: CANDIDATE_ID_1,
        resolvedPersonaId : PERSONA_ID_1,
        evidenceSpanIds   : [EVIDENCE_EVENT_ID]
      }),
      identityClaim({
        id                : IDENTITY_CLAIM_ID_2,
        personaCandidateId: CANDIDATE_ID_2,
        resolvedPersonaId : PERSONA_ID_2,
        evidenceSpanIds   : [EVIDENCE_RELATION_ID]
      }),
      identityClaim({
        id                : IDENTITY_CLAIM_ID_3,
        personaCandidateId: CANDIDATE_ID_3,
        resolvedPersonaId : PERSONA_ID_1,
        evidenceSpanIds   : [EVIDENCE_SPLIT_ID]
      })
    ]);

    const methodCalls: Array<{ method: string; input: unknown }> = [];
    const firstScenario = actionScenarios()[0];
    if (firstScenario === undefined) {
      throw new Error("missing scenario fixture");
    }

    const result = await runReviewRegressionActionScenarios({
      context               : { ...context, fixture: { ...fixture, reviewActions: [firstScenario] } },
      prismaClient,
      actorUserId           : USER_ID,
      now                   : () => NOW,
      mutationServiceFactory: (input) => createMutationServiceSpy(input, methodCalls)
    });

    expect(result).toEqual({
      passed         : 1,
      failed         : 0,
      scenarioResults: [{
        scenarioKey: "accept-fan-jin-event",
        passed     : true,
        message    : "passed",
        auditAction: "ACCEPT"
      }]
    });
    expect(methodCalls[0]?.input).toMatchObject({
      claimId: EVENT_CLAIM_ID
    });
  });
});

function createMutationServiceSpy(
  input: ReviewRegressionActionHarnessMutationServiceFactoryInput,
  methodCalls: Array<{ method: string; input: unknown }>
) {
  return {
    applyClaimAction: vi.fn(async (actionInput) => {
      methodCalls.push({ method: "applyClaimAction", input: actionInput });
      await input.auditService.logClaimAction({
        action         : actionInput.action,
        bookId         : actionInput.bookId,
        claimKind      : actionInput.claimKind,
        claimId        : actionInput.claimId,
        actorUserId    : actionInput.actorUserId,
        beforeState    : null,
        afterState     : null,
        note           : null,
        evidenceSpanIds: []
      });
      await input.projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : actionInput.bookId,
        projectionFamilies: ["persona_chapter_facts"]
      });
    }),
    editClaim: vi.fn(async (actionInput) => {
      methodCalls.push({ method: "editClaim", input: actionInput });
      await input.auditService.logClaimAction({
        action         : "EDIT",
        bookId         : actionInput.bookId,
        claimKind      : actionInput.claimKind,
        claimId        : actionInput.claimId,
        actorUserId    : actionInput.actorUserId,
        beforeState    : null,
        afterState     : null,
        note           : null,
        evidenceSpanIds: []
      });
      await input.projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : actionInput.bookId,
        projectionFamilies: ["relationship_edges"]
      });
    }),
    createManualClaim: vi.fn(async (actionInput) => {
      methodCalls.push({ method: "createManualClaim", input: actionInput });
      await input.auditService.logClaimAction({
        action         : "CREATE_MANUAL_CLAIM",
        bookId         : actionInput.draft.bookId,
        claimKind      : actionInput.claimKind,
        claimId        : "manual-claim-id",
        actorUserId    : actionInput.actorUserId,
        beforeState    : null,
        afterState     : null,
        note           : null,
        evidenceSpanIds: []
      });
      await input.projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : actionInput.draft.bookId,
        projectionFamilies: ["relationship_edges"]
      });
      return { id: "manual-claim-id" };
    }),
    relinkEvidence: vi.fn(async (actionInput) => {
      methodCalls.push({ method: "relinkEvidence", input: actionInput });
      await input.auditService.logClaimAction({
        action         : "RELINK_EVIDENCE",
        bookId         : actionInput.bookId,
        claimKind      : actionInput.claimKind,
        claimId        : actionInput.claimId,
        actorUserId    : actionInput.actorUserId,
        beforeState    : null,
        afterState     : null,
        note           : null,
        evidenceSpanIds: actionInput.evidenceSpanIds
      });
      await input.projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : actionInput.bookId,
        projectionFamilies: ["relationship_edges"]
      });
    }),
    mergePersona: vi.fn(async (actionInput) => {
      methodCalls.push({ method: "mergePersona", input: actionInput });
      await input.auditService.logPersonaAction({
        action         : "MERGE_PERSONA",
        bookId         : actionInput.bookId,
        personaId      : actionInput.targetPersonaId,
        actorUserId    : actionInput.actorUserId,
        beforeState    : null,
        afterState     : null,
        note           : null,
        evidenceSpanIds: []
      });
      await input.projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : actionInput.bookId,
        projectionFamilies: ["relationship_edges"]
      });
    }),
    splitPersona: vi.fn(async (actionInput) => {
      methodCalls.push({ method: "splitPersona", input: actionInput });
      await input.auditService.logPersonaAction({
        action         : "SPLIT_PERSONA",
        bookId         : actionInput.bookId,
        personaId      : actionInput.sourcePersonaId,
        actorUserId    : actionInput.actorUserId,
        beforeState    : null,
        afterState     : null,
        note           : null,
        evidenceSpanIds: []
      });
      await input.projectionBuilder.rebuildProjection({
        kind              : "PROJECTION_ONLY",
        bookId            : actionInput.bookId,
        projectionFamilies: ["relationship_edges"]
      });
      return { createdPersonaIds: [] };
    })
  };
}
