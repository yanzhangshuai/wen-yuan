import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "12121212-1212-4212-8212-121212121212";
const CLAIM_ID = "22222222-2222-4222-8222-222222222222";
const EVIDENCE_ID = "33333333-3333-4333-8333-333333333333";
const RUN_ID = "34343434-3434-4434-8434-343434343434";
const SOURCE_CANDIDATE_ID = "35353535-3535-4535-8535-353535353535";
const TARGET_CANDIDATE_ID = "36363636-3636-4636-8636-363636363636";

function buildRelationEditDraft() {
  return {
    bookId                  : BOOK_ID,
    chapterId               : CHAPTER_ID,
    confidence              : 0.85,
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
  headersMock         : vi.fn(),
  applyClaimActionMock: vi.fn(),
  editClaimMock       : vi.fn(),
  relinkEvidenceMock  : vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-mutation-service", () => ({
  createReviewMutationService: () => ({
    applyClaimAction: hoisted.applyClaimActionMock,
    editClaim       : hoisted.editClaimMock,
    relinkEvidence  : hoisted.relinkEvidenceMock
  })
}));

/**
 * 文件定位（admin review claim actions route 单测）：
 * - 对应 `POST /api/admin/review/claims/[claimKind]/[claimId]/actions`。
 * - 这里锁定动作分派：普通审核动作走 `applyClaimAction`，编辑走 `editClaim`，证据重绑走 `relinkEvidence`。
 */
describe("POST /api/admin/review/claims/:claimKind/:claimId/actions", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.applyClaimActionMock.mockReset();
    hoisted.editClaimMock.mockReset();
    hoisted.relinkEvidenceMock.mockReset();
    vi.resetModules();
  });

  it("dispatches DEFER action to the mutation service", async () => {
    hoisted.applyClaimActionMock.mockResolvedValue(undefined);

    const { POST } = await import("./route");
    const response = await POST(new Request(`http://localhost/api/admin/review/claims/EVENT/${CLAIM_ID}/actions`, {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId: BOOK_ID,
        action: "DEFER",
        note  : "hold"
      })
    }), {
      params: Promise.resolve({ claimKind: "EVENT", claimId: CLAIM_ID })
    });

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_CLAIM_ACTION_APPLIED");
    expect(hoisted.applyClaimActionMock).toHaveBeenCalledWith({
      bookId     : BOOK_ID,
      claimKind  : "EVENT",
      claimId    : CLAIM_ID,
      action     : "DEFER",
      note       : "hold",
      actorUserId: "user-1"
    });
  });

  it("dispatches EDIT action to the manual override mutation", async () => {
    hoisted.editClaimMock.mockResolvedValue({
      manualClaimId: "44444444-4444-4444-8444-444444444444"
    });

    const { POST } = await import("./route");
    const response = await POST(new Request(`http://localhost/api/admin/review/claims/RELATION/${CLAIM_ID}/actions`, {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId: BOOK_ID,
        action: "EDIT",
        note  : "fix relation",
        draft : buildRelationEditDraft()
      })
    }), {
      params: Promise.resolve({ claimKind: "RELATION", claimId: CLAIM_ID })
    });

    expect(response.status).toBe(200);
    expect(hoisted.editClaimMock).toHaveBeenCalledWith({
      bookId   : BOOK_ID,
      claimKind: "RELATION",
      claimId  : CLAIM_ID,
      draft    : {
        ...buildRelationEditDraft()
      },
      note       : "fix relation",
      actorUserId: "user-1"
    });
    expect(hoisted.applyClaimActionMock).not.toHaveBeenCalled();
    expect(hoisted.relinkEvidenceMock).not.toHaveBeenCalled();
  });

  it("dispatches RELINK_EVIDENCE action to the relink mutation", async () => {
    hoisted.relinkEvidenceMock.mockResolvedValue({
      manualClaimId: "55555555-5555-4555-8555-555555555555"
    });

    const { POST } = await import("./route");
    const response = await POST(new Request(`http://localhost/api/admin/review/claims/TIME/${CLAIM_ID}/actions`, {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId         : BOOK_ID,
        action         : "RELINK_EVIDENCE",
        note           : "rebind evidence",
        evidenceSpanIds: [EVIDENCE_ID]
      })
    }), {
      params: Promise.resolve({ claimKind: "TIME", claimId: CLAIM_ID })
    });

    expect(response.status).toBe(200);
    expect(hoisted.relinkEvidenceMock).toHaveBeenCalledWith({
      bookId         : BOOK_ID,
      claimKind      : "TIME",
      claimId        : CLAIM_ID,
      evidenceSpanIds: [EVIDENCE_ID],
      note           : "rebind evidence",
      actorUserId    : "user-1"
    });
    expect(hoisted.applyClaimActionMock).not.toHaveBeenCalled();
    expect(hoisted.editClaimMock).not.toHaveBeenCalled();
  });

  it("returns 400 when edit-like action targets a non-manual claim family", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request(`http://localhost/api/admin/review/claims/CONFLICT_FLAG/${CLAIM_ID}/actions`, {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId: BOOK_ID,
        action: "EDIT",
        note  : "invalid",
        draft : {
          bookId     : BOOK_ID,
          claimFamily: "CONFLICT_FLAG"
        }
      })
    }), {
      params: Promise.resolve({ claimKind: "CONFLICT_FLAG", claimId: CLAIM_ID })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.editClaimMock).not.toHaveBeenCalled();
  });

  it("returns 400 when edit draft is structurally invalid", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request(`http://localhost/api/admin/review/claims/RELATION/${CLAIM_ID}/actions`, {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId: BOOK_ID,
        action: "EDIT",
        note  : "invalid draft",
        draft : { bookId: BOOK_ID }
      })
    }), {
      params: Promise.resolve({ claimKind: "RELATION", claimId: CLAIM_ID })
    });

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.editClaimMock).not.toHaveBeenCalled();
  });
});
