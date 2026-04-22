import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const PERSONA_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID = "33333333-3333-4333-8333-333333333333";

const hoisted = vi.hoisted(() => ({
  headersMock                : vi.fn(),
  getPersonaChapterMatrixMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-query-service", () => ({
  createReviewQueryService: () => ({
    getPersonaChapterMatrix: hoisted.getPersonaChapterMatrixMock
  })
}));

function buildMatrixDto() {
  return {
    bookId  : BOOK_ID,
    personas: [{
      personaId                : PERSONA_ID,
      displayName              : "诸葛亮",
      aliases                  : ["孔明"],
      primaryPersonaCandidateId: "44444444-4444-4444-8444-444444444444",
      personaCandidateIds      : ["44444444-4444-4444-8444-444444444444"],
      firstChapterNo           : 1,
      totalEventCount          : 2,
      totalRelationCount       : 1,
      totalConflictCount       : 0
    }],
    chapters: [{
      chapterId: CHAPTER_ID,
      chapterNo: 1,
      title    : "宴桃园豪杰三结义",
      label    : "第一回 宴桃园豪杰三结义"
    }],
    cells: [{
      bookId            : BOOK_ID,
      personaId         : PERSONA_ID,
      chapterId         : CHAPTER_ID,
      chapterNo         : 1,
      eventCount        : 2,
      relationCount     : 1,
      conflictCount     : 0,
      reviewStateSummary: {
        EVENT   : { PENDING: 1, ACCEPTED: 1 },
        RELATION: { DEFERRED: 1 }
      },
      latestUpdatedAt: "2026-04-21T08:00:00.000Z"
    }],
    relationTypeOptions: [{
      relationTypeKey   : "ally_of",
      label             : "盟友",
      direction         : "BIDIRECTIONAL",
      relationTypeSource: "PRESET",
      aliasLabels       : ["同盟"],
      systemPreset      : true
    }],
    generatedAt: "2026-04-21T08:30:00.000Z"
  };
}

/**
 * 文件定位（persona x chapter matrix route 单测）：
 * - 对应 `GET /api/admin/review/persona-chapter-matrix`。
 * - 这里锁定路由 contract：管理员鉴权、query 校验，以及矩阵查询 service 的分派参数。
 */
describe("GET /api/admin/review/persona-chapter-matrix", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.getPersonaChapterMatrixMock.mockReset();
    vi.resetModules();
  });

  it("lists the persona chapter matrix for admins and normalizes repeated reviewStates params", async () => {
    hoisted.getPersonaChapterMatrixMock.mockResolvedValue(buildMatrixDto());

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/persona-chapter-matrix?bookId=${BOOK_ID}&personaId=${PERSONA_ID}&chapterId=${CHAPTER_ID}&reviewStates=PENDING&reviewStates=ACCEPTED,DEFERRED&conflictState=ACTIVE&limitPersonas=10&offsetPersonas=5`
    ));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_PERSONA_CHAPTER_MATRIX_FETCHED");
    expect(payload.data).toEqual(buildMatrixDto());
    expect(hoisted.getPersonaChapterMatrixMock).toHaveBeenCalledWith({
      bookId        : BOOK_ID,
      personaId     : PERSONA_ID,
      chapterId     : CHAPTER_ID,
      reviewStates  : ["PENDING", "ACCEPTED", "DEFERRED"],
      conflictState : "ACTIVE",
      limitPersonas : 10,
      offsetPersonas: 5
    });
  });

  it("returns 403 when auth guard fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/persona-chapter-matrix?bookId=${BOOK_ID}`
    ));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.getPersonaChapterMatrixMock).not.toHaveBeenCalled();
  });

  it("returns 400 when query is invalid", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/review/persona-chapter-matrix"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.getPersonaChapterMatrixMock).not.toHaveBeenCalled();
  });
});
