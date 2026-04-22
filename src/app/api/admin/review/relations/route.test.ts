import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const PERSONA_ID = "22222222-2222-4222-8222-222222222222";
const PAIR_PERSONA_ID = "33333333-3333-4333-8333-333333333333";

const hoisted = vi.hoisted(() => ({
  headersMock              : vi.fn(),
  getRelationEditorViewMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-query-service", () => ({
  createReviewQueryService: () => ({
    getRelationEditorView: hoisted.getRelationEditorViewMock
  })
}));

function buildRelationEditorDto() {
  return {
    bookId        : BOOK_ID,
    personaOptions: [{
      personaId   : PERSONA_ID,
      displayName : "诸葛亮",
      aliases     : ["孔明"]
    }],
    relationTypeOptions: [{
      relationTypeKey   : "ally_of",
      label             : "盟友",
      direction         : "BIDIRECTIONAL",
      relationTypeSource: "PRESET",
      aliasLabels       : ["同盟"],
      systemPreset      : true
    }],
    pairSummaries: [{
      pairKey          : `${PERSONA_ID}::${PAIR_PERSONA_ID}`,
      leftPersonaId    : PERSONA_ID,
      rightPersonaId   : PAIR_PERSONA_ID,
      leftPersonaName  : "诸葛亮",
      rightPersonaName : "刘备",
      totalClaims      : 2,
      activeClaims     : 2,
      latestUpdatedAt  : "2026-04-22T01:00:00.000Z",
      relationTypeKeys : ["ally_of"],
      reviewStateSummary: {
        ACCEPTED: 1,
        PENDING : 1
      },
      warningFlags: {
        directionConflict: false,
        intervalConflict : true
      }
    }],
    selectedPair: {
      pairKey: `${PERSONA_ID}::${PAIR_PERSONA_ID}`,
      leftPersona: {
        personaId   : PERSONA_ID,
        displayName : "诸葛亮",
        aliases     : ["孔明"]
      },
      rightPersona: {
        personaId   : PAIR_PERSONA_ID,
        displayName : "刘备",
        aliases     : ["玄德"]
      },
      warnings: {
        directionConflict: false,
        intervalConflict : true
      },
      claims: [{
        claimId              : "44444444-4444-4444-8444-444444444444",
        reviewState          : "PENDING",
        source               : "AI",
        conflictState        : "NONE",
        relationTypeKey      : "ally_of",
        relationLabel        : "同盟",
        relationTypeSource   : "PRESET",
        direction            : "BIDIRECTIONAL",
        effectiveChapterStart: 42,
        effectiveChapterEnd  : 45,
        chapterId            : "55555555-5555-4555-8555-555555555555",
        chapterLabel         : "第四十二回",
        timeLabel            : "赤壁之战后",
        evidenceSpanIds      : ["66666666-6666-4666-8666-666666666666"]
      }]
    },
    generatedAt: "2026-04-22T01:05:00.000Z"
  };
}

describe("GET /api/admin/review/relations", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.getRelationEditorViewMock.mockReset();
    vi.resetModules();
  });

  it("returns the relation editor dto for admins and normalizes repeated query filters", async () => {
    hoisted.getRelationEditorViewMock.mockResolvedValue(buildRelationEditorDto());

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/relations?bookId=${BOOK_ID}&personaId=${PERSONA_ID}&pairPersonaId=${PAIR_PERSONA_ID}&relationTypeKeys=ally_of&relationTypeKeys=enemy_of,custom_patron_of&reviewStates=PENDING&reviewStates=ACCEPTED,DEFERRED&conflictState=ACTIVE&limitPairs=10&offsetPairs=5`
    ));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_RELATION_EDITOR_FETCHED");
    expect(payload.data).toEqual(buildRelationEditorDto());
    expect(hoisted.getRelationEditorViewMock).toHaveBeenCalledWith({
      bookId          : BOOK_ID,
      personaId       : PERSONA_ID,
      pairPersonaId   : PAIR_PERSONA_ID,
      relationTypeKeys: ["ally_of", "enemy_of", "custom_patron_of"],
      reviewStates    : ["PENDING", "ACCEPTED", "DEFERRED"],
      conflictState   : "ACTIVE",
      limitPairs      : 10,
      offsetPairs     : 5
    });
  });

  it("returns 403 when admin auth fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/relations?bookId=${BOOK_ID}`
    ));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();
  });

  it("returns 400 when relation editor query params are invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request(
      `http://localhost/api/admin/review/relations?bookId=${BOOK_ID}&pairPersonaId=${PAIR_PERSONA_ID}`
    ));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.getRelationEditorViewMock).not.toHaveBeenCalled();
  });
});
