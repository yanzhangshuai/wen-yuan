import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_PERSONA_ID = "22222222-2222-4222-8222-222222222222";
const CANDIDATE_ID = "33333333-3333-4333-8333-333333333333";
const CREATED_PERSONA_ID = "44444444-4444-4444-8444-444444444444";

const hoisted = vi.hoisted(() => ({
  headersMock     : vi.fn(),
  splitPersonaMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-mutation-service", () => ({
  createReviewMutationService: () => ({
    splitPersona: hoisted.splitPersonaMock
  })
}));

/**
 * 文件定位（admin review persona split route 单测）：
 * - 对应 `POST /api/admin/review/personas/split`。
 * - 测试目标是锁定 split payload、返回值透传和 superRefine 参数校验行为。
 */
describe("POST /api/admin/review/personas/split", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.splitPersonaMock.mockReset();
    vi.resetModules();
  });

  it("dispatches split persona review mutation for admins", async () => {
    hoisted.splitPersonaMock.mockResolvedValue({
      createdPersonaIds: [CREATED_PERSONA_ID]
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/personas/split", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId         : BOOK_ID,
        sourcePersonaId: SOURCE_PERSONA_ID,
        splitTargets   : [{
          targetPersonaName  : "新角色",
          personaCandidateIds: [CANDIDATE_ID]
        }],
        note: "separate identities"
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_PERSONA_SPLIT");
    expect(payload.data).toEqual({ createdPersonaIds: [CREATED_PERSONA_ID] });
    expect(hoisted.splitPersonaMock).toHaveBeenCalledWith({
      bookId         : BOOK_ID,
      sourcePersonaId: SOURCE_PERSONA_ID,
      splitTargets   : [{
        targetPersonaName  : "新角色",
        personaCandidateIds: [CANDIDATE_ID]
      }],
      note       : "separate identities",
      actorUserId: "user-1"
    });
  });

  it("returns 400 when split target omits both targetPersonaId and targetPersonaName", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/personas/split", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId         : BOOK_ID,
        sourcePersonaId: SOURCE_PERSONA_ID,
        splitTargets   : [{
          personaCandidateIds: [CANDIDATE_ID]
        }]
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.splitPersonaMock).not.toHaveBeenCalled();
  });
});
