import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "book/001";
const PERSONA_ID = "persona/001";
const PAIR_PERSONA_ID = "persona/002";
const CLAIM_ID = "claim/777";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("relation editor service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
    vi.resetModules();
  });

  it("fetchRelationEditorView builds pair filters with repeated query params", async () => {
    const dto = {
      bookId             : BOOK_ID,
      personaOptions     : [],
      relationTypeOptions: [],
      pairSummaries      : [],
      selectedPair       : null
    };
    hoisted.clientFetchMock.mockResolvedValue(dto);
    const { fetchRelationEditorView } = await import("@/lib/services/relation-editor");

    const result = await fetchRelationEditorView({
      bookId          : BOOK_ID,
      personaId       : PERSONA_ID,
      pairPersonaId   : PAIR_PERSONA_ID,
      relationTypeKeys: ["ally_of", "enemy_of"],
      reviewStates    : ["PENDING", "ACCEPTED"],
      conflictState   : "ACTIVE",
      limitPairs      : 20,
      offsetPairs     : 40
    });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/relations?bookId=book%2F001&personaId=persona%2F001&pairPersonaId=persona%2F002&relationTypeKeys=ally_of&relationTypeKeys=enemy_of&reviewStates=PENDING&reviewStates=ACCEPTED&conflictState=ACTIVE&limitPairs=20&offsetPairs=40"
    );
    expect(result).toBe(dto);
  });

  it("fetchRelationEditorView omits empty optional params", async () => {
    hoisted.clientFetchMock.mockResolvedValue({
      bookId             : BOOK_ID,
      personaOptions     : [],
      relationTypeOptions: [],
      pairSummaries      : [],
      selectedPair       : null
    });
    const { fetchRelationEditorView } = await import("@/lib/services/relation-editor");

    await fetchRelationEditorView({
      bookId          : BOOK_ID,
      relationTypeKeys: [],
      reviewStates    : []
    });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/relations?bookId=book%2F001"
    );
  });

  it("re-exports the existing T12 claim wrappers instead of re-implementing them", async () => {
    const relationEditor = await import("@/lib/services/relation-editor");
    const reviewMatrix = await import("@/lib/services/review-matrix");

    expect(relationEditor.fetchReviewClaimDetail).toBe(reviewMatrix.fetchReviewClaimDetail);
    expect(relationEditor.submitReviewClaimAction).toBe(reviewMatrix.submitReviewClaimAction);
    expect(relationEditor.createManualReviewClaim).toBe(reviewMatrix.createManualReviewClaim);

    hoisted.clientFetchMock.mockResolvedValue({
      claim: {
        id                      : CLAIM_ID,
        claimId                 : CLAIM_ID,
        claimKind               : "RELATION",
        bookId                  : BOOK_ID,
        chapterId               : "chapter-1",
        reviewState             : "PENDING",
        source                  : "AI",
        conflictState           : "NONE",
        createdAt               : "2026-04-21T10:00:00.000Z",
        updatedAt               : "2026-04-21T10:05:00.000Z",
        personaCandidateIds     : [PERSONA_ID, PAIR_PERSONA_ID],
        personaIds              : [PERSONA_ID, PAIR_PERSONA_ID],
        timeLabel               : null,
        relationTypeKey         : "teacher_of",
        evidenceSpanIds         : ["evidence-1"],
        runId                   : "run-1",
        confidence              : 0.94,
        supersedesClaimId       : null,
        derivedFromClaimId      : null,
        relationLabel           : "师生",
        relationTypeSource      : "PRESET",
        direction               : "FORWARD",
        sourcePersonaCandidateId: PERSONA_ID,
        targetPersonaCandidateId: PAIR_PERSONA_ID
      },
      evidence: [{
        id                 : "evidence-1",
        chapterId          : "chapter-1",
        chapterLabel       : "第1回 学道登场",
        startOffset        : 10,
        endOffset          : 18,
        quotedText         : "周进提拔范进。",
        normalizedText     : "周进提拔范进。",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-21T09:00:00.000Z"
      }],
      basisClaim: null,
      aiSummary : {
        basisClaimId  : CLAIM_ID,
        basisClaimKind: "RELATION",
        source        : "AI",
        runId         : "run-1",
        confidence    : 0.94,
        summaryLines  : ["关系：周进 -> 范进"],
        rawOutput     : {
          stageKey         : "stage_b3",
          provider         : "openai",
          model            : "gpt-5.4-mini",
          createdAt        : "2026-04-21T09:00:00.000Z",
          responseExcerpt  : "提取到师生关系。",
          hasStructuredJson: true,
          parseError       : null,
          schemaError      : null,
          discardReason    : null
        }
      },
      projectionSummary: {
        personaChapterFacts: [],
        personaTimeFacts   : [],
        relationshipEdges  : [],
        timelineEvents     : []
      },
      auditHistory: [],
      versionDiff : {
        versionSource     : "NONE",
        supersedesClaimId : null,
        derivedFromClaimId: null,
        fieldDiffs        : []
      }
    });

    await relationEditor.fetchReviewClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "RELATION",
      claimId  : CLAIM_ID
    });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/claims/RELATION/claim%2F777?bookId=book%2F001"
    );
    const detail = await relationEditor.fetchReviewClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "RELATION",
      claimId  : CLAIM_ID
    });
    expect(detail.aiSummary?.rawOutput?.stageKey).toBe("stage_b3");
    expect(detail.versionDiff?.versionSource).toBe("NONE");
  });
});
