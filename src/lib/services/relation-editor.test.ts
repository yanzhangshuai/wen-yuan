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
      bookId        : BOOK_ID,
      personaOptions: [],
      relationTypeOptions: [],
      pairSummaries : [],
      selectedPair  : null
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
      bookId        : BOOK_ID,
      personaOptions: [],
      relationTypeOptions: [],
      pairSummaries : [],
      selectedPair  : null
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
      claim            : { id: CLAIM_ID, claimKind: "RELATION" },
      evidence         : [],
      basisClaim       : null,
      projectionSummary: {
        personaChapterFacts: [],
        personaTimeFacts   : [],
        relationshipEdges  : [],
        timelineEvents     : []
      },
      auditHistory: []
    });

    await relationEditor.fetchReviewClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "RELATION",
      claimId  : CLAIM_ID
    });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/claims/RELATION/claim%2F777?bookId=book%2F001"
    );
  });
});
