import { describe, expect, it, vi } from "vitest";

import { runEndToEndAcceptance } from "./runner";

const BASELINE_RUN_ID = "baseline-run-1";
const CANDIDATE_RUN_ID = "candidate-run-1";

describe("runEndToEndAcceptance", () => {
  it("uses passed T21 regression action results when live audit logs are empty", async () => {
    const result = await runEndToEndAcceptance({
      scenarios: [{
        scenarioKey          : "rulin-waishi-sample",
        sampleBookId         : "book-1",
        baselineRunId        : BASELINE_RUN_ID,
        candidateRunId       : CANDIDATE_RUN_ID,
        bookTitle            : "儒林外史",
        fixturePath          : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
        reportPaths          : {
          markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
          jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
        },
        referenceReports: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        manualChecks: []
      }],
      finalReportPaths: {
        markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
        jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
      },
      ensureRegressionReport: vi.fn().mockResolvedValue({
        markdownPath : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        jsonPath     : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
        actionResults: [
          { scenarioKey: "accept-claim", passed: true, message: "passed", auditAction: "ACCEPT" },
          { scenarioKey: "reject-claim", passed: true, message: "passed", auditAction: "REJECT" },
          { scenarioKey: "defer-claim", passed: true, message: "passed", auditAction: "DEFER" },
          { scenarioKey: "edit-claim", passed: true, message: "passed", auditAction: "EDIT" },
          { scenarioKey: "manual-claim", passed: true, message: "passed", auditAction: "CREATE_MANUAL_CLAIM" },
          { scenarioKey: "relink-evidence", passed: true, message: "passed", auditAction: "RELINK_EVIDENCE" },
          { scenarioKey: "merge-persona", passed: true, message: "passed", auditAction: "MERGE_PERSONA" },
          { scenarioKey: "split-persona", passed: true, message: "passed", auditAction: "SPLIT_PERSONA" }
        ],
        runComparison: {
          snapshotDiff  : { identical: true },
          costComparison: { totalDeltaUsd: -0.02 }
        }
      } as never),
      acceptanceRepository: {
        loadBookContext: vi.fn().mockResolvedValue({
          book        : { id: "book-1", title: "儒林外史" },
          claimDetails: [{
            claimKind  : "EVENT",
            claimId    : "event-1",
            reviewState: "ACCEPTED",
            evidence   : [{
              id         : "ev-1",
              chapterId  : "chapter-3",
              quotedText : "范进中举",
              startOffset: 10,
              endOffset  : 14
            }]
          }],
          auditActions    : [],
          projectionCounts: {
            personaChapterFacts: 1,
            personaTimeFacts   : 1,
            relationshipEdges  : 1,
            timelineEvents     : 1
          },
          relationCatalogAvailable: true,
          routes                  : {
            personaChapter: "/admin/review/book-1",
            relationEditor: "/admin/review/book-1/relations",
            personaTime   : "/admin/review/book-1/time"
          }
        })
      },
      snapshotProvider: {
        buildBeforeAfter: vi.fn().mockResolvedValue({
          beforeSnapshotKeys           : ["persona:范进"],
          afterSnapshotKeys            : ["persona:范进"],
          reviewedClaimBackedProjection: true
        })
      },
      manualCheckRecorder: vi.fn().mockResolvedValue([]),
      writeArtifact      : vi.fn().mockResolvedValue(undefined)
    });

    const reviewLoop = result.bookReports[0]?.loopResults.find((loop) => loop.loopKey === "REVIEW");

    expect(reviewLoop?.passed).toBe(true);
    expect(result.overallDecision).toBe("GO");
  });

  it("marks rebuild cost comparison as missing when T21 runComparison is absent", async () => {
    const result = await runEndToEndAcceptance({
      scenarios: [{
        scenarioKey          : "rulin-waishi-sample",
        sampleBookId         : "book-1",
        baselineRunId        : BASELINE_RUN_ID,
        candidateRunId       : CANDIDATE_RUN_ID,
        bookTitle            : "儒林外史",
        fixturePath          : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
        reportPaths          : {
          markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
          jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
        },
        referenceReports: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        manualChecks: []
      }],
      finalReportPaths: {
        markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
        jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
      },
      ensureRegressionReport: vi.fn().mockResolvedValue({
        markdownPath : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        jsonPath     : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
        actionResults: [],
        runComparison: null
      } as never),
      acceptanceRepository: {
        loadBookContext: vi.fn().mockResolvedValue({
          book        : { id: "book-1", title: "儒林外史" },
          claimDetails: [{
            claimKind  : "EVENT",
            claimId    : "event-1",
            reviewState: "ACCEPTED",
            evidence   : [{
              id         : "ev-1",
              chapterId  : "chapter-3",
              quotedText : "范进中举",
              startOffset: 10,
              endOffset  : 14
            }]
          }],
          auditActions: [
            "ACCEPT",
            "REJECT",
            "DEFER",
            "EDIT",
            "CREATE_MANUAL_CLAIM",
            "RELINK_EVIDENCE",
            "MERGE_PERSONA",
            "SPLIT_PERSONA"
          ],
          projectionCounts: {
            personaChapterFacts: 1,
            personaTimeFacts   : 1,
            relationshipEdges  : 1,
            timelineEvents     : 1
          },
          relationCatalogAvailable: true,
          routes                  : {
            personaChapter: "/admin/review/book-1",
            relationEditor: "/admin/review/book-1/relations",
            personaTime   : "/admin/review/book-1/time"
          }
        })
      },
      snapshotProvider: {
        buildBeforeAfter: vi.fn().mockResolvedValue({
          beforeSnapshotKeys           : ["persona:范进"],
          afterSnapshotKeys            : ["persona:范进"],
          reviewedClaimBackedProjection: true
        })
      },
      manualCheckRecorder: vi.fn().mockResolvedValue([]),
      writeArtifact      : vi.fn().mockResolvedValue(undefined)
    });

    const rebuildLoop = result.bookReports[0]?.loopResults.find((loop) => loop.loopKey === "REBUILD");

    expect(rebuildLoop?.evidenceLines).toContain("hasCostComparison=false");
    expect(rebuildLoop?.passed).toBe(false);
  });

  it("regenerates missing T21 report, evaluates loops, and writes artifacts", async () => {
    const writeArtifact = vi.fn().mockResolvedValue(undefined);

    const result = await runEndToEndAcceptance({
      scenarios: [{
        scenarioKey          : "rulin-waishi-sample",
        sampleBookId         : "book-1",
        baselineRunId        : BASELINE_RUN_ID,
        candidateRunId       : CANDIDATE_RUN_ID,
        bookTitle            : "儒林外史",
        fixturePath          : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
        reportPaths          : {
          markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
          jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
        },
        referenceReports: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        manualChecks: []
      }],
      finalReportPaths: {
        markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
        jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
      },
      ensureRegressionReport: vi.fn().mockResolvedValue({
        markdownPath : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        jsonPath     : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
        runComparison: {
          snapshotDiff  : { identical: true },
          costComparison: { totalDeltaUsd: -0.02 }
        }
      }),
      acceptanceRepository: {
        loadBookContext: vi.fn().mockResolvedValue({
          book        : { id: "book-1", title: "儒林外史" },
          claimDetails: [{
            claimKind  : "EVENT",
            claimId    : "event-1",
            reviewState: "ACCEPTED",
            evidence   : [{
              id         : "ev-1",
              chapterId  : "chapter-3",
              quotedText : "范进中举",
              startOffset: 10,
              endOffset  : 14
            }]
          }],
          auditActions: [
            "ACCEPT",
            "REJECT",
            "DEFER",
            "EDIT",
            "CREATE_MANUAL_CLAIM",
            "RELINK_EVIDENCE",
            "MERGE_PERSONA",
            "SPLIT_PERSONA"
          ],
          projectionCounts: {
            personaChapterFacts: 1,
            personaTimeFacts   : 1,
            relationshipEdges  : 1,
            timelineEvents     : 1
          },
          relationCatalogAvailable: true,
          routes                  : {
            personaChapter: "/admin/review/book-1",
            relationEditor: "/admin/review/book-1/relations",
            personaTime   : "/admin/review/book-1/time"
          }
        })
      },
      snapshotProvider: {
        buildBeforeAfter: vi.fn().mockResolvedValue({
          beforeSnapshotKeys           : ["persona:范进"],
          afterSnapshotKeys            : ["persona:范进"],
          reviewedClaimBackedProjection: true
        })
      },
      manualCheckRecorder: vi.fn().mockResolvedValue([]),
      writeArtifact
    });

    expect(result.overallDecision).toBe("GO");
    expect(writeArtifact).toHaveBeenCalledTimes(4);
  });

  it("returns NO_GO when manual checks remain blocking", async () => {
    const result = await runEndToEndAcceptance({
      scenarios: [{
        scenarioKey          : "rulin-waishi-sample",
        sampleBookId         : "book-1",
        baselineRunId        : BASELINE_RUN_ID,
        candidateRunId       : CANDIDATE_RUN_ID,
        bookTitle            : "儒林外史",
        fixturePath          : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
        reportPaths          : {
          markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
          jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
        },
        referenceReports: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        manualChecks: [{
          checkKey           : "persona-chapter-evidence-jump",
          routeKind          : "personaChapter",
          expectedObservation: "jump works"
        }]
      }],
      finalReportPaths: {
        markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
        jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
      },
      ensureRegressionReport: vi.fn().mockResolvedValue({
        markdownPath : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        jsonPath     : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
        runComparison: {
          snapshotDiff  : { identical: true },
          costComparison: { totalDeltaUsd: -0.02 }
        }
      }),
      acceptanceRepository: {
        loadBookContext: vi.fn().mockResolvedValue({
          book        : { id: "book-1", title: "儒林外史" },
          claimDetails: [{
            claimKind  : "EVENT",
            claimId    : "event-1",
            reviewState: "ACCEPTED",
            evidence   : [{
              id         : "ev-1",
              chapterId  : "chapter-3",
              quotedText : "范进中举",
              startOffset: 10,
              endOffset  : 14
            }]
          }],
          auditActions: [
            "ACCEPT",
            "REJECT",
            "DEFER",
            "EDIT",
            "CREATE_MANUAL_CLAIM",
            "RELINK_EVIDENCE",
            "MERGE_PERSONA",
            "SPLIT_PERSONA"
          ],
          projectionCounts: {
            personaChapterFacts: 1,
            personaTimeFacts   : 1,
            relationshipEdges  : 1,
            timelineEvents     : 1
          },
          relationCatalogAvailable: true,
          routes                  : {
            personaChapter: "/admin/review/book-1",
            relationEditor: "/admin/review/book-1/relations",
            personaTime   : "/admin/review/book-1/time"
          }
        })
      },
      snapshotProvider: {
        buildBeforeAfter: vi.fn().mockResolvedValue({
          beforeSnapshotKeys           : ["persona:范进"],
          afterSnapshotKeys            : ["persona:范进"],
          reviewedClaimBackedProjection: true
        })
      },
      manualCheckRecorder: vi.fn().mockResolvedValue([{
        checkKey           : "persona-chapter-evidence-jump",
        routePath          : "/admin/review/book-1",
        expectedObservation: "jump works",
        observed           : "PENDING_MANUAL_VERIFICATION",
        passed             : false,
        blocking           : true
      }]),
      writeArtifact: vi.fn().mockResolvedValue(undefined)
    });

    expect(result.overallDecision).toBe("NO_GO");
  });

  it("requires every action declared by T21 scenarios, even if only part of them passed", async () => {
    const result = await runEndToEndAcceptance({
      scenarios: [{
        scenarioKey          : "rulin-waishi-sample",
        sampleBookId         : "book-1",
        baselineRunId        : BASELINE_RUN_ID,
        candidateRunId       : CANDIDATE_RUN_ID,
        bookTitle            : "儒林外史",
        fixturePath          : "tests/fixtures/review-regression/rulin-waishi.fixture.json",
        manualObservationPath: "docs/superpowers/reports/evidence-review-acceptance/manual-checks/rulin-waishi-sample.json",
        reportPaths          : {
          markdownPath: "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.md",
          jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/rulin-waishi-sample/summary.json"
        },
        referenceReports: {
          t20TaskPath    : "docs/superpowers/tasks/2026-04-18-evidence-review/20-cutover-read-paths.md",
          t21MarkdownPath: "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
          t21JsonPath    : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json"
        },
        manualChecks: []
      }],
      finalReportPaths: {
        markdownPath: "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.md",
        jsonPath    : "docs/superpowers/reports/evidence-review-acceptance/final-go-no-go.json"
      },
      ensureRegressionReport: vi.fn().mockResolvedValue({
        markdownPath : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.md",
        jsonPath     : "docs/superpowers/reports/review-regression/rulin-waishi-sample/summary.json",
        actionResults: [
          { scenarioKey: "merge-persona", passed: true, message: "passed", auditAction: "MERGE_PERSONA" },
          { scenarioKey: "defer-fact", passed: false, message: "failed", auditAction: "DEFER" }
        ],
        runComparison: {
          snapshotDiff  : { identical: true },
          costComparison: { totalDeltaUsd: -0.02 }
        }
      } as never),
      acceptanceRepository: {
        loadBookContext: vi.fn().mockResolvedValue({
          book        : { id: "book-1", title: "儒林外史" },
          claimDetails: [{
            claimKind  : "EVENT",
            claimId    : "event-1",
            reviewState: "ACCEPTED",
            evidence   : [{
              id         : "ev-1",
              chapterId  : "chapter-3",
              quotedText : "范进中举",
              startOffset: 10,
              endOffset  : 14
            }]
          }],
          auditActions    : [],
          projectionCounts: {
            personaChapterFacts: 1,
            personaTimeFacts   : 1,
            relationshipEdges  : 1,
            timelineEvents     : 1
          },
          relationCatalogAvailable: true,
          routes                  : {
            personaChapter: "/admin/review/book-1",
            relationEditor: "/admin/review/book-1/relations",
            personaTime   : "/admin/review/book-1/time"
          }
        })
      },
      snapshotProvider: {
        buildBeforeAfter: vi.fn().mockResolvedValue({
          beforeSnapshotKeys           : ["persona:范进"],
          afterSnapshotKeys            : ["persona:范进"],
          reviewedClaimBackedProjection: true
        })
      },
      manualCheckRecorder: vi.fn().mockResolvedValue([]),
      writeArtifact      : vi.fn().mockResolvedValue(undefined)
    });

    const reviewLoop = result.bookReports[0]?.loopResults.find((loop) => loop.loopKey === "REVIEW");

    expect(reviewLoop?.passed).toBe(false);
    expect(reviewLoop?.evidenceLines).toContain("Missing DEFER");
  });
});
