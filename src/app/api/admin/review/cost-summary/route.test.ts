import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import type * as ReviewCosts from "@/server/modules/review/evidence-review/costs";
import { ReviewRunCostSummaryNotFoundError } from "@/server/modules/review/evidence-review/costs/cost-summary-service";

const RUN_ID = "11111111-1111-4111-8111-111111111111";

const hoisted = vi.hoisted(() => ({
  headersMock   : vi.fn(),
  getSummaryMock: vi.fn()
}));

vi.mock("next/headers", () => ({
  headers: hoisted.headersMock
}));

vi.mock("@/server/modules/review/evidence-review/costs", async () => {
  const actual = await vi.importActual<typeof ReviewCosts>(
    "@/server/modules/review/evidence-review/costs"
  );

  return {
    ...actual,
    reviewRunCostSummaryService: {
      getSummary: hoisted.getSummaryMock
    }
  };
});

describe("GET /api/admin/review/cost-summary", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.getSummaryMock.mockReset();
    vi.resetModules();
  });

  it("requires runId, delegates to the summary service, and serializes bigint totals", async () => {
    hoisted.getSummaryMock.mockResolvedValue({
      runId      : RUN_ID,
      bookId     : "book-1",
      trigger    : "PROJECTION_REBUILD",
      scope      : "PROJECTION_ONLY",
      rerunReason: "Projection-only rebuild",
      totals     : {
        promptTokens       : 20,
        completionTokens   : 5,
        totalTokens        : 25,
        estimatedCostMicros: BigInt(250),
        durationMs         : 90000,
        skippedCount       : 1
      },
      stages: [{
        stageKey           : "STAGE_D",
        status             : "SUCCEEDED",
        chapterStartNo     : null,
        chapterEndNo       : null,
        promptTokens       : 20,
        completionTokens   : 5,
        totalTokens        : 25,
        estimatedCostMicros: BigInt(250),
        durationMs         : 90000,
        skippedCount       : 1
      }]
    });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/cost-summary?runId=${RUN_ID}`
    ));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_RUN_COST_SUMMARY_FETCHED");
    expect(payload.data.totals.estimatedCostMicros).toBe("250");
    expect(payload.data.stages[0].estimatedCostMicros).toBe("250");
    expect(hoisted.getSummaryMock).toHaveBeenCalledWith(RUN_ID);
  });

  it("returns 403 when the auth guard fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/cost-summary?runId=${RUN_ID}`
    ));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.getSummaryMock).not.toHaveBeenCalled();
  });

  it("returns 400 when runId is missing", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("http://localhost/api/admin/review/cost-summary"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.getSummaryMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the target run does not exist", async () => {
    hoisted.getSummaryMock.mockRejectedValue(new ReviewRunCostSummaryNotFoundError(RUN_ID));

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/cost-summary?runId=${RUN_ID}`
    ));

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });
});
