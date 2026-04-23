import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";

const hoisted = vi.hoisted(() => ({
  headersMock       : vi.fn(),
  getClaimDetailMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-query-service", () => ({
  createReviewQueryService: () => ({
    getClaimDetail: hoisted.getClaimDetailMock
  })
}));

/**
 * 文件定位（admin review claim detail route 单测）：
 * - 对应 `GET /api/admin/review/claims/[claimKind]/[claimId]`。
 * - 重点验证 detail 路由对 bookId、动态 params 与 not-found 语义的映射是否稳定。
 */
describe("GET /api/admin/review/claims/:claimKind/:claimId", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.getClaimDetailMock.mockReset();
    vi.resetModules();
  });

  it("returns review claim detail for admins", async () => {
    hoisted.getClaimDetailMock.mockResolvedValue({
      claim: {
        claimKind          : "EVENT",
        claimId            : CLAIM_ID,
        id                 : CLAIM_ID,
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
        evidenceSpanIds    : [],
        runId              : "33333333-3333-4333-8333-333333333333",
        confidence         : 0.88,
        supersedesClaimId  : null,
        derivedFromClaimId : null
      },
      evidence: [{
        id                 : "evidence-1",
        chapterId          : "chapter-1",
        chapterLabel       : "第1回 学道登场",
        startOffset        : 12,
        endOffset          : 28,
        quotedText         : "范进叩首称谢。",
        normalizedText     : "范进叩首称谢。",
        speakerHint        : "叙事",
        narrativeRegionType: "NARRATIVE",
        createdAt          : "2026-04-21T00:00:00.000Z"
      }],
      basisClaim: null,
      aiSummary : {
        basisClaimId  : null,
        basisClaimKind: null,
        source        : "AI",
        runId         : "33333333-3333-4333-8333-333333333333",
        confidence    : 0.88,
        summaryLines  : ["事件：范进赴试"],
        rawOutput     : {
          stageKey         : "stage_b2",
          provider         : "openai",
          model            : "gpt-5.4-mini",
          createdAt        : "2026-04-21T00:00:00.000Z",
          responseExcerpt  : "提取到范进赴试。",
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
      auditHistory: [{
        id             : "audit-1",
        action         : "EDIT",
        actorUserId    : "user-1",
        note           : "修订谓词",
        evidenceSpanIds: ["evidence-1"],
        createdAt      : "2026-04-21T00:10:00.000Z",
        beforeState    : { predicate: "赴试" },
        afterState     : { predicate: "中举" },
        fieldDiffs     : [{
          fieldKey  : "predicate",
          fieldLabel: "事件谓词",
          beforeText: "赴试",
          afterText : "中举"
        }]
      }],
      versionDiff: {
        versionSource     : "AUDIT_EDIT",
        supersedesClaimId : null,
        derivedFromClaimId: null,
        fieldDiffs        : [{
          fieldKey  : "predicate",
          fieldLabel: "事件谓词",
          beforeText: "赴试",
          afterText : "中举"
        }]
      }
    });

    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/admin/review/claims/EVENT/${CLAIM_ID}?bookId=${BOOK_ID}`),
      { params: Promise.resolve({ claimKind: "EVENT", claimId: CLAIM_ID }) }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_CLAIM_DETAIL_FETCHED");
    expect(payload.data).toEqual(expect.objectContaining({
      claim: expect.objectContaining({
        id        : CLAIM_ID,
        runId     : "33333333-3333-4333-8333-333333333333",
        confidence: 0.88
      }),
      evidence: [
        expect.objectContaining({
          id          : "evidence-1",
          chapterLabel: "第1回 学道登场"
        })
      ],
      aiSummary: expect.objectContaining({
        rawOutput: expect.objectContaining({
          stageKey       : "stage_b2",
          responseExcerpt: "提取到范进赴试。"
        })
      }),
      auditHistory: [
        expect.objectContaining({
          fieldDiffs: [
            expect.objectContaining({
              fieldKey  : "predicate",
              beforeText: "赴试",
              afterText : "中举"
            })
          ]
        })
      ],
      versionDiff: expect.objectContaining({
        versionSource: "AUDIT_EDIT"
      })
    }));
    expect(hoisted.getClaimDetailMock).toHaveBeenCalledWith({
      bookId   : BOOK_ID,
      claimKind: "EVENT",
      claimId  : CLAIM_ID
    });
  });

  it("returns 404 when review claim detail does not exist", async () => {
    hoisted.getClaimDetailMock.mockResolvedValue(null);

    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/admin/review/claims/EVENT/${CLAIM_ID}?bookId=${BOOK_ID}`),
      { params: Promise.resolve({ claimKind: "EVENT", claimId: CLAIM_ID }) }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 400 when route params are invalid", async () => {
    const { GET } = await import("./route");
    const response = await GET(
      new Request(`http://localhost/api/admin/review/claims/EVENT/invalid?bookId=${BOOK_ID}`),
      { params: Promise.resolve({ claimKind: "EVENT", claimId: "invalid" }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.getClaimDetailMock).not.toHaveBeenCalled();
  });
});
