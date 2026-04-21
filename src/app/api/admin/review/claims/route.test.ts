import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "12121212-1212-4212-8212-121212121212";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "13131313-1313-4313-8313-131313131313";
const EVIDENCE_ID = "14141414-1414-4414-8414-141414141414";
const SOURCE_CANDIDATE_ID = "15151515-1515-4515-8515-151515151515";
const TARGET_CANDIDATE_ID = "16161616-1616-4616-8616-161616161616";

function buildRelationManualDraft() {
  return {
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    confidence              : 0.91,
    runId                   : RUN_ID,
    evidenceSpanIds         : [EVIDENCE_ID],
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: SOURCE_CANDIDATE_ID,
    targetPersonaCandidateId: TARGET_CANDIDATE_ID,
    relationTypeKey         : "friend_of",
    relationLabel           : "朋友",
    relationTypeSource      : "PRESET",
    direction               : "FORWARD",
    effectiveChapterStart   : 1,
    effectiveChapterEnd     : 2,
    timeHintId              : null
  };
}

const hoisted = vi.hoisted(() => ({
  headersMock          : vi.fn(),
  listClaimsMock       : vi.fn(),
  createManualClaimMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-query-service", () => ({
  createReviewQueryService: () => ({
    listClaims: hoisted.listClaimsMock
  })
}));

vi.mock("@/server/modules/review/evidence-review/review-mutation-service", () => ({
  createReviewMutationService: () => ({
    createManualClaim: hoisted.createManualClaimMock
  })
}));

/**
 * 文件定位（admin review claim list/create route 单测）：
 * - 对应 `GET/POST /api/admin/review/claims`。
 * - 这里锁定路由层 contract：管理员鉴权、query/body 校验，以及 query/mutation service 分派参数。
 */
describe("GET /api/admin/review/claims", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.listClaimsMock.mockReset();
    hoisted.createManualClaimMock.mockReset();
    vi.resetModules();
  });

  it("lists review claims for admins", async () => {
    hoisted.listClaimsMock.mockResolvedValue({
      items: [{
        claimKind          : "EVENT",
        claimId            : CLAIM_ID,
        bookId             : BOOK_ID,
        chapterId          : null,
        reviewState        : "PENDING",
        source             : "AI",
        conflictState      : "NONE",
        createdAt          : new Date("2026-04-21T00:00:00.000Z"),
        updatedAt          : new Date("2026-04-21T00:00:00.000Z"),
        personaCandidateIds: [],
        personaIds         : [],
        timeLabel          : null,
        relationTypeKey    : null,
        evidenceSpanIds    : []
      }],
      total: 1
    });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/claims?bookId=${BOOK_ID}&claimKinds=EVENT,RELATION&reviewStates=PENDING&sources=AI&limit=10&offset=5`
    ));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_CLAIMS_LISTED");
    expect(hoisted.listClaimsMock).toHaveBeenCalledWith({
      bookId      : BOOK_ID,
      claimKinds  : ["EVENT", "RELATION"],
      reviewStates: ["PENDING"],
      sources     : ["AI"],
      limit       : 10,
      offset      : 5
    });
  });

  it("returns 403 when auth guard fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { GET } = await import("./route");
    const response = await GET(new Request(`http://localhost/api/admin/review/claims?bookId=${BOOK_ID}`));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.listClaimsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when query is invalid", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/review/claims"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.listClaimsMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/review/claims", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.listClaimsMock.mockReset();
    hoisted.createManualClaimMock.mockReset();
    vi.resetModules();
  });

  it("creates a standalone manual claim and records actor user id", async () => {
    hoisted.createManualClaimMock.mockResolvedValue({ id: CLAIM_ID });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/claims", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        claimKind: "RELATION",
        note     : "manual add",
        draft    : buildRelationManualDraft()
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_MANUAL_CLAIM_CREATED");
    expect(hoisted.createManualClaimMock).toHaveBeenCalledWith(expect.objectContaining({
      claimKind  : "RELATION",
      actorUserId: "user-1"
    }));
  });

  it("returns 401 when authenticated admin context is missing user id", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/claims", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        claimKind: "EVENT",
        note     : null,
        draft    : {}
      })
    }));

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_UNAUTHORIZED");
    expect(hoisted.createManualClaimMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/claims", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        note : "missing kind",
        draft: {}
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.createManualClaimMock).not.toHaveBeenCalled();
  });

  it("returns 400 when manual claim draft is structurally invalid", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/claims", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        claimKind: "RELATION",
        note     : "manual add",
        draft    : { bookId: BOOK_ID }
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.createManualClaimMock).not.toHaveBeenCalled();
  });
});
