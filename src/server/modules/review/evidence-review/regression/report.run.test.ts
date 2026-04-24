import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import type { ReviewRegressionFixture, ReviewRegressionMetricSummary } from "./contracts";

const hoisted = vi.hoisted(() => ({
  loadReviewRegressionFixture           : vi.fn(),
  buildCurrentReviewRegressionSnapshot  : vi.fn(),
  buildRunScopedReviewRegressionSnapshot: vi.fn(),
  runReviewRegressionActionScenarios    : vi.fn(),
  evaluateReviewRegressionFixture       : vi.fn(),
  compareReviewRegressionRuns           : vi.fn(),
  getSummary                            : vi.fn()
}));

vi.mock("./fixture-loader", () => ({
  loadReviewRegressionFixture: hoisted.loadReviewRegressionFixture
}));

vi.mock("./snapshot-builder", () => ({
  buildCurrentReviewRegressionSnapshot  : hoisted.buildCurrentReviewRegressionSnapshot,
  buildRunScopedReviewRegressionSnapshot: hoisted.buildRunScopedReviewRegressionSnapshot
}));

vi.mock("./review-action-harness", () => ({
  runReviewRegressionActionScenarios: hoisted.runReviewRegressionActionScenarios
}));

vi.mock("./metrics", () => ({
  evaluateReviewRegressionFixture: hoisted.evaluateReviewRegressionFixture
}));

vi.mock("./run-comparison", () => ({
  compareReviewRegressionRuns: hoisted.compareReviewRegressionRuns
}));

vi.mock("@/server/modules/review/evidence-review/costs", () => ({
  reviewRunCostSummaryService: {
    getSummary: hoisted.getSummary
  }
}));

const { runReviewGoldSetRegression } = await import("./report");

const FIXTURE: ReviewRegressionFixture = {
  fixtureKey   : "rulin-waishi",
  bookTitle    : "儒林外史",
  chapterRange : { startNo: 3, endNo: 4 },
  personas     : [],
  chapterFacts : [],
  relations    : [],
  timeFacts    : [],
  reviewActions: [],
  rerunSamples : []
};

const METRICS: ReviewRegressionMetricSummary = {
  personaAccuracy: {
    matched    : 0,
    missing    : 0,
    unexpected : 0,
    accuracyPct: 100
  },
  relationStability: {
    matched     : 0,
    missing     : 0,
    changed     : 0,
    stabilityPct: 100
  },
  timeNormalizationUsability: {
    usable      : 0,
    unusable    : 0,
    usabilityPct: 100
  },
  evidenceTraceability: {
    traced         : 0,
    untraced       : 0,
    traceabilityPct: 100
  },
  reviewActionSuccessRate: {
    passed    : 0,
    failed    : 0,
    successPct: 100
  }
};

const VALID_UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/i;

describe("runReviewGoldSetRegression", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it("uses a stable UUID actor id when the caller omits actorUserId", async () => {
    // Arrange
    const reportDir = await mkdtemp(join(tmpdir(), "review-regression-run-"));
    const repository = {
      resolveFixtureContext: vi.fn().mockResolvedValue({
        fixture : FIXTURE,
        book    : { id: "book-1", title: "儒林外史" },
        chapters: []
      }),
      loadCurrentReviewRows: vi.fn().mockResolvedValue({
        eventClaims             : [],
        relationClaims          : [],
        timeClaims              : [],
        identityResolutionClaims: [],
        evidenceSpans           : [],
        personas                : [],
        personaAliases          : []
      }),
      loadRunScopedClaimRows: vi.fn()
    };

    hoisted.loadReviewRegressionFixture.mockResolvedValueOnce(FIXTURE);
    hoisted.buildCurrentReviewRegressionSnapshot.mockReturnValueOnce({});
    hoisted.runReviewRegressionActionScenarios.mockResolvedValueOnce({
      passed         : 0,
      failed         : 0,
      scenarioResults: []
    });
    hoisted.evaluateReviewRegressionFixture.mockReturnValueOnce({
      metrics       : METRICS,
      missingKeys   : [],
      unexpectedKeys: [],
      changedKeys   : []
    });

    try {
      // Act
      await runReviewGoldSetRegression({
        fixturePath: "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        command    : "pnpm exec tsx scripts/review-regression/run-gold-set-regression.ts --fixture tests/fixtures/review-regression/rulin-waishi.fixture.json",
        reportDir,
        repository : repository as never
      });
    } finally {
      await rm(reportDir, { force: true, recursive: true });
    }

    // Assert
    expect(hoisted.runReviewRegressionActionScenarios).toHaveBeenCalledWith(expect.objectContaining({
      actorUserId: expect.stringMatching(VALID_UUID_PATTERN)
    }));
  });
});
