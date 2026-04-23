import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";

const hoisted = vi.hoisted(() => ({
  headersMock   : vi.fn(),
  planChangeMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/analysis/pipelines/evidence-review/rerun-planner", () => ({
  evidenceReviewRerunPlanner: {
    planChange: hoisted.planChangeMock
  }
}));

describe("POST /api/admin/review/rerun-plan", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.planChangeMock.mockReset();
    vi.resetModules();
  });

  it("validates the rerun change payload and delegates to the planner for admins", async () => {
    hoisted.planChangeMock.mockResolvedValue({
      bookId        : BOOK_ID,
      changeKind    : "REVIEW_MUTATION",
      executionMode : "PROJECTION_ONLY",
      reason        : "manual review change",
      expectedStages: ["STAGE_D"],
      affectedRange : {
        runIds             : ["run-1"],
        chapterIds         : [],
        chapterNos         : [],
        segmentIds         : [],
        claimFamilies      : ["RELATION"],
        personaCandidateIds: [],
        projectionScopes   : [{
          kind              : "PROJECTION_ONLY",
          bookId            : BOOK_ID,
          projectionFamilies: ["relationship_edges"]
        }],
        projectionFamilies: ["relationship_edges"]
      },
      stagePlans: [{
        stageKey               : "STAGE_D",
        scopeKind              : "PROJECTION_REBUILD",
        chapterIds             : [],
        preservePreviousOutputs: true
      }],
      cache: {
        invalidateStageKeys          : ["STAGE_D"],
        preserveStageKeys            : ["STAGE_0", "STAGE_A", "STAGE_A_PLUS", "STAGE_B", "STAGE_B5", "STAGE_C"],
        invalidatedProjectionFamilies: ["relationship_edges"],
        comparableBaselineRunId      : "run-1"
      },
      explanation: {
        summary: "Projection-only rebuild for manual review mutation.",
        lines  : ["Manual review changed only local review projections."]
      }
    });

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/rerun-plan", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        changeKind      : "REVIEW_MUTATION",
        bookId          : BOOK_ID,
        reason          : "manual review change",
        runId           : "run-1",
        claimFamilies   : ["RELATION"],
        projectionScopes: [{
          kind              : "PROJECTION_ONLY",
          bookId            : BOOK_ID,
          projectionFamilies: ["relationship_edges"]
        }]
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_RERUN_PLAN_PREVIEWED");
    expect(payload.data.executionMode).toBe("PROJECTION_ONLY");
    expect(hoisted.planChangeMock).toHaveBeenCalledWith({
      changeKind      : "REVIEW_MUTATION",
      bookId          : BOOK_ID,
      reason          : "manual review change",
      runId           : "run-1",
      claimFamilies   : ["RELATION"],
      projectionScopes: [{
        kind              : "PROJECTION_ONLY",
        bookId            : BOOK_ID,
        projectionFamilies: ["relationship_edges"]
      }]
    });
  });

  it("returns 403 when the auth guard fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/rerun-plan", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({
        changeKind      : "REVIEW_MUTATION",
        bookId          : BOOK_ID,
        reason          : "manual review change",
        projectionScopes: [{
          kind              : "PROJECTION_ONLY",
          bookId            : BOOK_ID,
          projectionFamilies: ["relationship_edges"]
        }]
      })
    }));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.planChangeMock).not.toHaveBeenCalled();
  });

  it("returns 400 when the body does not match the rerun change schema", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("http://localhost/api/admin/review/rerun-plan", {
      method : "POST",
      headers: { "content-type": "application/json" },
      body   : JSON.stringify({ changeKind: "REVIEW_MUTATION", bookId: BOOK_ID })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.planChangeMock).not.toHaveBeenCalled();
  });
});
