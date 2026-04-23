import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import type * as ReviewCosts from "@/server/modules/review/evidence-review/costs";

const BASELINE_RUN_ID = "11111111-1111-4111-8111-111111111111";
const CANDIDATE_RUN_ID = "22222222-2222-4222-8222-222222222222";

const hoisted = vi.hoisted(() => ({
  headersMock   : vi.fn(),
  getSummaryMock: vi.fn(),
  compareMock   : vi.fn()
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
    },
    compareReviewRunCostSummaries: hoisted.compareMock
  };
});

describe("GET /api/admin/review/cost-comparison", () => {
  beforeEach(() => {
    hoisted.headersMock.mockResolvedValue(new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    }));
  });

  afterEach(() => {
    hoisted.headersMock.mockReset();
    hoisted.getSummaryMock.mockReset();
    hoisted.compareMock.mockReset();
    vi.resetModules();
  });

  it("requires both run ids, loads both summaries, and returns a serialized comparison envelope", async () => {
    const baseline = {
      runId      : BASELINE_RUN_ID,
      bookId     : "book-1",
      trigger    : "ANALYSIS_JOB",
      scope      : "FULL_BOOK",
      rerunReason: "Full-book baseline",
      totals     : {
        promptTokens       : 800,
        completionTokens   : 200,
        totalTokens        : 1000,
        estimatedCostMicros: BigInt(1000),
        durationMs         : 200000,
        skippedCount       : 0
      },
      stages: []
    };
    const candidate = {
      runId      : CANDIDATE_RUN_ID,
      bookId     : "book-1",
      trigger    : "PROJECTION_REBUILD",
      scope      : "PROJECTION_ONLY",
      rerunReason: "Projection-only rebuild",
      totals     : {
        promptTokens       : 200,
        completionTokens   : 50,
        totalTokens        : 250,
        estimatedCostMicros: BigInt(250),
        durationMs         : 50000,
        skippedCount       : 2
      },
      stages: []
    };
    hoisted.getSummaryMock
      .mockResolvedValueOnce(baseline)
      .mockResolvedValueOnce(candidate);
    hoisted.compareMock.mockReturnValue({
      baseline,
      candidate,
      delta: {
        promptTokens       : -600,
        completionTokens   : -150,
        totalTokens        : -750,
        estimatedCostMicros: BigInt(-750),
        durationMs         : -150000,
        skippedCount       : 2
      },
      savings: {
        totalTokenSavingsPct: 75,
        costSavingsPct      : 75,
        durationSavingsPct  : 75
      },
      stageCoverage: {
        baselineStageKeys : ["STAGE_0", "STAGE_A", "STAGE_C"],
        candidateStageKeys: ["STAGE_D"],
        skippedStageKeys  : ["STAGE_0", "STAGE_A", "STAGE_C"]
      }
    });

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/cost-comparison?baselineRunId=${BASELINE_RUN_ID}&candidateRunId=${CANDIDATE_RUN_ID}`
    ));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("REVIEW_RUN_COST_COMPARISON_FETCHED");
    expect(payload.data.delta.estimatedCostMicros).toBe("-750");
    expect(payload.data.baseline.totals.estimatedCostMicros).toBe("1000");
    expect(hoisted.getSummaryMock).toHaveBeenNthCalledWith(1, BASELINE_RUN_ID);
    expect(hoisted.getSummaryMock).toHaveBeenNthCalledWith(2, CANDIDATE_RUN_ID);
    expect(hoisted.compareMock).toHaveBeenCalledWith(baseline, candidate);
  });

  it("returns 403 when the auth guard fails", async () => {
    hoisted.headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));

    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/cost-comparison?baselineRunId=${BASELINE_RUN_ID}&candidateRunId=${CANDIDATE_RUN_ID}`
    ));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
    expect(hoisted.getSummaryMock).not.toHaveBeenCalled();
    expect(hoisted.compareMock).not.toHaveBeenCalled();
  });

  it("returns 400 when either run id is missing", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request(
      `http://localhost/api/admin/review/cost-comparison?baselineRunId=${BASELINE_RUN_ID}`
    ));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(hoisted.getSummaryMock).not.toHaveBeenCalled();
    expect(hoisted.compareMock).not.toHaveBeenCalled();
  });
});
