import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "book/001";
const PERSONA_ID = "persona/001";
const CHAPTER_ID = "chapter/003";
const CLAIM_ID = "claim/777";
const EVIDENCE_ID = "evidence/009";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

/**
 * 文件定位（人物章节审核矩阵客户端服务单测）：
 * - 覆盖 T13 矩阵页在浏览器端访问 T12/T13 review API 的 URL 与 payload 契约。
 * - 该层不校验业务数据，只负责把审核 UI 操作稳定翻译成 HTTP 调用。
 */
describe("review matrix service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
    vi.resetModules();
  });

  it("fetchPersonaChapterMatrix builds book filters and repeated review state params", async () => {
    // Arrange
    const matrix = {
      bookId  : BOOK_ID,
      personas: [],
      chapters: [],
      cells   : []
    };
    hoisted.clientFetchMock.mockResolvedValue(matrix);
    const { fetchPersonaChapterMatrix } = await import("@/lib/services/review-matrix");

    // Act
    const result = await fetchPersonaChapterMatrix({
      bookId        : BOOK_ID,
      personaId     : PERSONA_ID,
      chapterId     : CHAPTER_ID,
      reviewStates  : ["PENDING", "CONFLICTED"],
      conflictState : "ACTIVE",
      limitPersonas : 20,
      offsetPersonas: 40
    });

    // Assert
    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/persona-chapter-matrix?bookId=book%2F001&personaId=persona%2F001&chapterId=chapter%2F003&reviewStates=PENDING&reviewStates=CONFLICTED&conflictState=ACTIVE&limitPersonas=20&offsetPersonas=40"
    );
    expect(result).toBe(matrix);
  });

  it("fetchCellClaims calls the T12 claim list endpoint with the reviewable cell claim kinds", async () => {
    // Arrange
    const claims = { items: [], total: 0 };
    hoisted.clientFetchMock.mockResolvedValue(claims);
    const { fetchCellClaims } = await import("@/lib/services/review-matrix");

    // Act
    const result = await fetchCellClaims({
      bookId   : BOOK_ID,
      personaId: PERSONA_ID,
      chapterId: CHAPTER_ID,
      limit    : 50,
      offset   : 10
    });

    // Assert
    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/claims?bookId=book%2F001&personaId=persona%2F001&chapterId=chapter%2F003&claimKinds=EVENT&claimKinds=RELATION&claimKinds=CONFLICT_FLAG&limit=50&offset=10"
    );
    expect(result).toBe(claims);
  });

  it("fetchReviewClaimDetail calls the T12 claim detail endpoint", async () => {
    // Arrange
    const detail = {
      claim            : { id: CLAIM_ID, claimKind: "EVENT" },
      evidence         : [],
      basisClaim       : null,
      projectionSummary: {
        personaChapterFacts: [],
        personaTimeFacts   : [],
        relationshipEdges  : [],
        timelineEvents     : []
      },
      auditHistory: []
    };
    hoisted.clientFetchMock.mockResolvedValue(detail);
    const { fetchReviewClaimDetail } = await import("@/lib/services/review-matrix");

    // Act
    const result = await fetchReviewClaimDetail({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : CLAIM_ID
    });

    // Assert
    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/claims/EVENT/claim%2F777?bookId=book%2F001"
    );
    expect(result).toBe(detail);
  });

  it("submitReviewClaimAction posts all supported action payload shapes", async () => {
    // Arrange
    hoisted.clientMutateMock.mockResolvedValue(undefined);
    const { submitReviewClaimAction } = await import("@/lib/services/review-matrix");

    // Act
    await submitReviewClaimAction({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : CLAIM_ID,
      action   : "ACCEPT",
      note     : "确认"
    });
    await submitReviewClaimAction({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : CLAIM_ID,
      action   : "REJECT",
      note     : null
    });
    await submitReviewClaimAction({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : CLAIM_ID,
      action   : "DEFER",
      note     : "暂缓"
    });
    await submitReviewClaimAction({
      bookId   : BOOK_ID,
      claimKind: "RELATION",
      claimId  : CLAIM_ID,
      action   : "EDIT",
      note     : "修正关系",
      draft    : { bookId: BOOK_ID, relationTypeKey: "friend_of" }
    });
    await submitReviewClaimAction({
      bookId         : BOOK_ID,
      claimKind      : "RELATION",
      claimId        : CLAIM_ID,
      action         : "RELINK_EVIDENCE",
      note           : "重绑证据",
      evidenceSpanIds: [EVIDENCE_ID]
    });

    // Assert
    const url = "/api/admin/review/claims/EVENT/claim%2F777/actions";
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(1, url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ bookId: BOOK_ID, action: "ACCEPT", note: "确认" })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(2, url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ bookId: BOOK_ID, action: "REJECT", note: null })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(3, url, {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ bookId: BOOK_ID, action: "DEFER", note: "暂缓" })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(4, "/api/admin/review/claims/RELATION/claim%2F777/actions", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        bookId: BOOK_ID,
        action: "EDIT",
        note  : "修正关系",
        draft : { bookId: BOOK_ID, relationTypeKey: "friend_of" }
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(5, "/api/admin/review/claims/RELATION/claim%2F777/actions", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        bookId         : BOOK_ID,
        action         : "RELINK_EVIDENCE",
        note           : "重绑证据",
        evidenceSpanIds: [EVIDENCE_ID]
      })
    });
  });

  it("createManualReviewClaim posts to the T12 manual claim endpoint and returns the created claim data", async () => {
    // Arrange
    const created = { id: CLAIM_ID, claimKind: "RELATION" };
    hoisted.clientFetchMock.mockResolvedValue(created);
    const { createManualReviewClaim } = await import("@/lib/services/review-matrix");

    // Act
    const result = await createManualReviewClaim({
      claimKind: "RELATION",
      note     : "手工补充",
      draft    : { bookId: BOOK_ID, relationTypeKey: "friend_of" }
    });

    // Assert
    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/review/claims", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        claimKind: "RELATION",
        note     : "手工补充",
        draft    : { bookId: BOOK_ID, relationTypeKey: "friend_of" }
      })
    });
    expect(result).toBe(created);
  });

  it("surfaces clientFetch and clientMutate errors without swallowing them", async () => {
    // Arrange
    hoisted.clientFetchMock.mockRejectedValueOnce(new Error("matrix failed"));
    hoisted.clientMutateMock.mockRejectedValueOnce(new Error("action failed"));
    const {
      fetchPersonaChapterMatrix,
      submitReviewClaimAction
    } = await import("@/lib/services/review-matrix");

    // Act / Assert
    await expect(fetchPersonaChapterMatrix({ bookId: BOOK_ID })).rejects.toThrow("matrix failed");
    await expect(submitReviewClaimAction({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : CLAIM_ID,
      action   : "ACCEPT",
      note     : null
    })).rejects.toThrow("action failed");
  });
});
