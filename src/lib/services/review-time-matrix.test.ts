import { beforeEach, describe, expect, it, vi } from "vitest";

const BOOK_ID = "book/001";
const PERSONA_ID = "persona/001";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

/**
 * 文件定位（人物时间审核矩阵客户端服务单测）：
 * - 锁定 T15 时间审核页对 route/query string 的浏览器侧契约。
 * - 该层只负责组织 HTTP 请求与复用 T12 wrapper，不承载服务端推导逻辑。
 */
describe("review time matrix service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
    vi.resetModules();
  });

  it("fetchPersonaTimeMatrix builds time filters and repeated timeTypes params", async () => {
    const matrix = {
      bookId     : BOOK_ID,
      personas   : [],
      timeGroups : [],
      cells      : [],
      generatedAt: "2026-04-22T08:00:00.000Z"
    };
    hoisted.clientFetchMock.mockResolvedValue(matrix);
    const { fetchPersonaTimeMatrix } = await import("@/lib/services/review-time-matrix");

    const result = await fetchPersonaTimeMatrix({
      bookId        : BOOK_ID,
      personaId     : PERSONA_ID,
      timeTypes     : ["RELATIVE_PHASE", "NAMED_EVENT"],
      limitPersonas : 20,
      offsetPersonas: 40
    });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/persona-time-matrix?bookId=book%2F001&personaId=persona%2F001&timeTypes=RELATIVE_PHASE&timeTypes=NAMED_EVENT&limitPersonas=20&offsetPersonas=40"
    );
    expect(result).toBe(matrix);
  });

  it("fetchTimeCellClaims calls the T12 claim list endpoint with time-aware claim kinds", async () => {
    const claims = { items: [], total: 0 };
    hoisted.clientFetchMock.mockResolvedValue(claims);
    const { fetchTimeCellClaims } = await import("@/lib/services/review-time-matrix");

    const result = await fetchTimeCellClaims({
      bookId       : BOOK_ID,
      personaId    : PERSONA_ID,
      timeLabel    : "赤壁之战前",
      reviewStates : ["PENDING"],
      conflictState: "ACTIVE",
      limit        : 50,
      offset       : 10
    });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith(
      "/api/admin/review/claims?bookId=book%2F001&personaId=persona%2F001&timeLabel=%E8%B5%A4%E5%A3%81%E4%B9%8B%E6%88%98%E5%89%8D&claimKinds=TIME&claimKinds=EVENT&claimKinds=RELATION&claimKinds=CONFLICT_FLAG&reviewStates=PENDING&conflictState=ACTIVE&limit=50&offset=10"
    );
    expect(result).toBe(claims);
  });

  it("re-exports the existing T12 claim detail and mutation wrappers", async () => {
    const reviewTimeMatrix = await import("@/lib/services/review-time-matrix");
    const reviewMatrix = await import("@/lib/services/review-matrix");

    expect(reviewTimeMatrix.fetchReviewClaimDetail).toBe(reviewMatrix.fetchReviewClaimDetail);
    expect(reviewTimeMatrix.submitReviewClaimAction).toBe(reviewMatrix.submitReviewClaimAction);
    expect(reviewTimeMatrix.createManualReviewClaim).toBe(reviewMatrix.createManualReviewClaim);
  });
});
