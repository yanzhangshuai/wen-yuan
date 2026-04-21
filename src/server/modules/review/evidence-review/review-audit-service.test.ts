import { describe, expect, it, vi } from "vitest";

import { createReviewAuditService } from "@/server/modules/review/evidence-review/review-audit-service";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const CLAIM_ID = "22222222-2222-2222-2222-222222222222";
const PERSONA_ID = "33333333-3333-3333-3333-333333333333";
const TARGET_PERSONA_ID = "44444444-4444-4444-4444-444444444444";
const USER_ID = "55555555-5555-5555-5555-555555555555";
const EVIDENCE_ID_1 = "66666666-6666-6666-6666-666666666666";
const EVIDENCE_ID_2 = "77777777-7777-7777-7777-777777777777";

describe("createReviewAuditService", () => {
  it("writes claim audit logs with explicit DEFER action and actor user id", async () => {
    const reviewAuditLog = { create: vi.fn().mockResolvedValue({ id: "audit-1" }) };
    const service = createReviewAuditService({ reviewAuditLog } as never);

    await service.logClaimAction({
      bookId         : BOOK_ID,
      claimKind      : "EVENT",
      claimId        : CLAIM_ID,
      actorUserId    : USER_ID,
      action         : "DEFER",
      beforeState    : { reviewState: "PENDING" },
      afterState     : { reviewState: "DEFERRED" },
      note           : "wait for human review",
      // 审计层必须自己规整证据 id，避免上游 mutation/query 在不同入口产生重复与顺序漂移。
      evidenceSpanIds: [EVIDENCE_ID_2, EVIDENCE_ID_1, EVIDENCE_ID_2]
    });

    expect(reviewAuditLog.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        action         : "DEFER",
        actorUserId    : USER_ID,
        claimKind      : "EVENT",
        claimId        : CLAIM_ID,
        evidenceSpanIds: [EVIDENCE_ID_1, EVIDENCE_ID_2]
      })
    }));
  });

  it("rejects audit writes when actorUserId is blank", async () => {
    const service = createReviewAuditService({
      reviewAuditLog: { create: vi.fn() }
    } as never);

    await expect(service.logPersonaAction({
      bookId     : BOOK_ID,
      personaId  : PERSONA_ID,
      actorUserId: "   ",
      action     : "MERGE_PERSONA",
      beforeState: { sourcePersonaId: PERSONA_ID },
      afterState : { targetPersonaId: TARGET_PERSONA_ID }
    })).rejects.toThrow("actorUserId is required");
  });

  it("lists audit history newest-first for claim detail panels", async () => {
    const reviewAuditLog = {
      findMany: vi.fn().mockResolvedValue([
        { id: "audit-2", action: "EDIT", createdAt: new Date("2026-04-21T10:00:00Z") },
        { id: "audit-1", action: "ACCEPT", createdAt: new Date("2026-04-21T09:00:00Z") }
      ])
    };
    const service = createReviewAuditService({ reviewAuditLog } as never);

    const result = await service.listAuditTrail({
      claimKind: "EVENT",
      claimId  : CLAIM_ID
    });

    expect(reviewAuditLog.findMany).toHaveBeenCalledWith({
      where  : { claimKind: "EVENT", claimId: CLAIM_ID },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }]
    });
    expect(result.map((entry) => entry.id)).toEqual(["audit-2", "audit-1"]);
  });
});
