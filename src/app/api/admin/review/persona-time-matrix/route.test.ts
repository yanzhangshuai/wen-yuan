import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const PERSONA_ID = "22222222-2222-4222-8222-222222222222";
const TIME_CLAIM_ID = "33333333-3333-4333-8333-333333333333";

const hoisted = vi.hoisted(() => ({
  headersMock             : vi.fn(),
  getPersonaTimeMatrixMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-query-service", () => ({
  createReviewQueryService: () => ({
    getPersonaTimeMatrix: hoisted.getPersonaTimeMatrixMock
  })
}));

function buildPersonaTimeMatrixDto() {
  return {
    bookId  : BOOK_ID,
    personas: [{
      personaId                : PERSONA_ID,
      displayName              : "诸葛亮",
      aliases                  : ["孔明"],
      primaryPersonaCandidateId: "44444444-4444-4444-8444-444444444444",
      personaCandidateIds      : ["44444444-4444-4444-8444-444444444444"],
      firstTimeSortKey         : 20,
      totalEventCount          : 2,
      totalRelationCount       : 1,
      totalTimeClaimCount      : 1
    }],
    timeGroups: [{
      timeType        : "NAMED_EVENT",
      label           : "事件节点",
      defaultCollapsed: false,
      slices          : [{
        timeKey          : "NAMED_EVENT::%E8%B5%A4%E5%A3%81%E4%B9%8B%E6%88%98%E5%89%8D::20::2::3",
        timeType         : "NAMED_EVENT",
        normalizedLabel  : "赤壁之战前",
        rawLabels        : ["赤壁之战前"],
        timeSortKey      : 20,
        chapterRangeStart: 2,
        chapterRangeEnd  : 3,
        linkedChapters   : [{
          chapterId: "55555555-5555-4555-8555-555555555555",
          chapterNo: 2,
          label    : "第2回 赤壁战前"
        }],
        sourceTimeClaimIds: [TIME_CLAIM_ID]
      }]
    }],
    cells: [{
      bookId            : BOOK_ID,
      personaId         : PERSONA_ID,
      timeKey           : "NAMED_EVENT::%E8%B5%A4%E5%A3%81%E4%B9%8B%E6%88%98%E5%89%8D::20::2::3",
      normalizedLabel   : "赤壁之战前",
      eventCount        : 2,
      relationCount     : 1,
      timeClaimCount    : 1,
      sourceTimeClaimIds: [TIME_CLAIM_ID],
      latestUpdatedAt   : "2026-04-22T01:00:00.000Z"
    }],
    generatedAt: "2026-04-22T01:05:00.000Z"
  };
}

/**
 * 文件定位（persona x time matrix route 单测）：
 * - 对应 `GET /api/admin/review/persona-time-matrix`。
 * - 这里锁定路由 contract：管理员鉴权、timeTypes query 归一化、Zod 校验和 query service 分派。
 */
describe("GET /api/admin/review/persona-time-matrix", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.getPersonaTimeMatrixMock.mockReset();
    vi.resetModules();
  });

  it("returns the persona-time matrix for admins and normalizes repeated timeTypes params", async () => {
    hoisted.getPersonaTimeMatrixMock.mockResolvedValue(buildPersonaTimeMatrixDto());

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/persona-time-matrix?bookId=${BOOK_ID}&personaId=${PERSONA_ID}&timeTypes=RELATIVE_PHASE&timeTypes=NAMED_EVENT,HISTORICAL_YEAR&limitPersonas=10&offsetPersonas=5`
    ));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_PERSONA_TIME_MATRIX_FETCHED");
    expect(payload.data).toEqual(buildPersonaTimeMatrixDto());
    expect(hoisted.getPersonaTimeMatrixMock).toHaveBeenCalledWith({
      bookId        : BOOK_ID,
      personaId     : PERSONA_ID,
      timeTypes     : ["RELATIVE_PHASE", "NAMED_EVENT", "HISTORICAL_YEAR"],
      limitPersonas : 10,
      offsetPersonas: 5
    });
  });

  it("returns 403 when auth guard fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/persona-time-matrix?bookId=${BOOK_ID}`
    ));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.getPersonaTimeMatrixMock).not.toHaveBeenCalled();
  });

  it("returns 400 when query is invalid", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/persona-time-matrix?bookId=${BOOK_ID}&timeTypes=SPRING`
    ));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.getPersonaTimeMatrixMock).not.toHaveBeenCalled();
  });
});
