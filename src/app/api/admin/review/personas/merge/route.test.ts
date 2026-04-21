import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const SOURCE_PERSONA_ID = "22222222-2222-4222-8222-222222222222";
const TARGET_PERSONA_ID = "33333333-3333-4333-8333-333333333333";
const CANDIDATE_ID = "44444444-4444-4444-8444-444444444444";

const hoisted = vi.hoisted(() => ({
  headersMock     : vi.fn(),
  mergePersonaMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/review-mutation-service", () => ({
  createReviewMutationService: () => ({
    mergePersona: hoisted.mergePersonaMock
  })
}));

/**
 * 文件定位（admin review persona merge route 单测）：
 * - 对应 `POST /api/admin/review/personas/merge`。
 * - 这里约束 merge payload 必须显式带 `personaCandidateIds`，避免退回 legacy 推断式输入。
 */
describe("POST /api/admin/review/personas/merge", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.mergePersonaMock.mockReset();
    vi.resetModules();
  });

  it("dispatches merge persona review mutation for admins", async () => {
    hoisted.mergePersonaMock.mockResolvedValue(undefined);

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/personas/merge", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId             : BOOK_ID,
        sourcePersonaId    : SOURCE_PERSONA_ID,
        targetPersonaId    : TARGET_PERSONA_ID,
        personaCandidateIds: [CANDIDATE_ID],
        note               : "same person"
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_PERSONA_MERGED");
    expect(hoisted.mergePersonaMock).toHaveBeenCalledWith({
      bookId             : BOOK_ID,
      sourcePersonaId    : SOURCE_PERSONA_ID,
      targetPersonaId    : TARGET_PERSONA_ID,
      personaCandidateIds: [CANDIDATE_ID],
      note               : "same person",
      actorUserId        : "user-1"
    });
  });

  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/personas/merge", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        bookId         : BOOK_ID,
        sourcePersonaId: SOURCE_PERSONA_ID
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.mergePersonaMock).not.toHaveBeenCalled();
  });
});
