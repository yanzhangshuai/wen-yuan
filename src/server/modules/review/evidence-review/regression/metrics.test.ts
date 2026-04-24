import { describe, expect, it } from "vitest";

import type {
  ReviewRegressionFixture,
  ReviewRegressionSnapshot
} from "./contracts";
import { evaluateReviewRegressionFixture } from "./metrics";

function createFixture(overrides: Partial<ReviewRegressionFixture> = {}): ReviewRegressionFixture {
  return {
    fixtureKey  : "rulin-waishi-metrics",
    bookTitle   : "儒林外史",
    chapterRange: { startNo: 1, endNo: 2 },
    personas    : [
      {
        personaName     : "范进",
        aliases         : ["范生"],
        chapterNos      : [1],
        evidenceSnippets: ["范进中举"],
        pressureCases   : []
      },
      {
        personaName     : "周进",
        aliases         : ["周学道"],
        chapterNos      : [1],
        evidenceSnippets: ["周进点拨范进"],
        pressureCases   : []
      }
    ],
    chapterFacts: [
      {
        personaName     : "范进",
        chapterNo       : 1,
        factLabel       : "中举",
        evidenceSnippets: ["范进中举"]
      }
    ],
    relations: [
      {
        sourcePersonaName    : "范进",
        targetPersonaName    : "周进",
        relationTypeKey      : "mentor.custom",
        relationLabel        : "师生",
        direction            : "FORWARD",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 1,
        evidenceSnippets     : ["周进点拨范进"]
      }
    ],
    timeFacts: [
      {
        personaName      : "范进",
        normalizedLabel  : "第一回",
        timeSortKey      : 1,
        chapterRangeStart: 1,
        chapterRangeEnd  : 1,
        isImprecise      : false,
        evidenceSnippets : ["第一回"]
      }
    ],
    reviewActions: [],
    rerunSamples : [],
    ...overrides
  };
}

function createSnapshot(overrides: Partial<ReviewRegressionSnapshot> = {}): ReviewRegressionSnapshot {
  return {
    fixtureKey  : "rulin-waishi-metrics",
    bookTitle   : "儒林外史",
    chapterRange: { startNo: 1, endNo: 2 },
    personas    : [
      { personaName: "范进", aliases: ["范举人"] },
      { personaName: "严贡生", aliases: [] }
    ],
    chapterFacts: [
      {
        personaName     : "范进",
        chapterNo       : 1,
        factLabel       : "中举",
        evidenceSnippets: ["范进中举"]
      },
      {
        personaName     : "范进",
        chapterNo       : 2,
        factLabel       : "赴宴",
        evidenceSnippets: []
      }
    ],
    relations: [
      {
        sourcePersonaName    : "范进",
        targetPersonaName    : "周进",
        relationTypeKey      : "mentor.custom",
        direction            : "REVERSE",
        effectiveChapterStart: 1,
        effectiveChapterEnd  : 2,
        evidenceSnippets     : []
      }
    ],
    timeFacts: [
      {
        personaName      : "范进",
        normalizedLabel  : "第一回",
        timeSortKey      : 1,
        chapterRangeStart: 1,
        chapterRangeEnd  : 1,
        evidenceSnippets : ["第一回"]
      },
      {
        personaName      : "严贡生",
        normalizedLabel  : "席终后",
        timeSortKey      : null,
        chapterRangeStart: null,
        chapterRangeEnd  : null,
        evidenceSnippets : []
      }
    ],
    ...overrides
  };
}

describe("evaluateReviewRegressionFixture", () => {
  it("reports metrics plus family-qualified diffs for persona, relation, time, evidence, and action results", () => {
    // Arrange
    const fixture = createFixture();
    const snapshot = createSnapshot();

    // Act
    const evaluation = evaluateReviewRegressionFixture(fixture, snapshot, {
      scenarioResults: [
        { scenarioKey: "accept-fact", passed: true, message: "ok", auditAction: "ACCEPT" },
        { scenarioKey: "reject-relation", passed: false, message: "failed", auditAction: "REJECT" },
        { scenarioKey: "defer-time", passed: true, message: "ok", auditAction: "DEFER" }
      ]
    });

    // Assert
    expect(evaluation).toEqual({
      metrics: {
        personaAccuracy: {
          matched    : 1,
          missing    : 1,
          unexpected : 1,
          accuracyPct: 33.3
        },
        relationStability: {
          matched     : 0,
          missing     : 0,
          changed     : 1,
          stabilityPct: 0
        },
        timeNormalizationUsability: {
          usable      : 1,
          unusable    : 1,
          usabilityPct: 50
        },
        evidenceTraceability: {
          traced         : 2,
          untraced       : 3,
          traceabilityPct: 40
        },
        reviewActionSuccessRate: {
          passed    : 2,
          failed    : 1,
          successPct: 66.7
        }
      },
      missingKeys: [
        "personas:周进"
      ],
      unexpectedKeys: [
        "chapterFacts:范进\u001f2\u001f赴宴",
        "personas:严贡生",
        "timeFacts:严贡生\u001f席终后\u001fnull\u001fnull"
      ],
      changedKeys: [
        "relations:范进\u001f周进\u001fmentor.custom"
      ]
    });
  });

  it("treats time facts without normalized labels or chapter linkage as unusable", () => {
    // Arrange
    const fixture = createFixture({ personas: [], chapterFacts: [], relations: [], timeFacts: [] });
    const snapshot = createSnapshot({
      personas    : [],
      chapterFacts: [],
      relations   : [],
      timeFacts   : [
        {
          personaName      : "范进",
          normalizedLabel  : "",
          timeSortKey      : 1,
          chapterRangeStart: 1,
          chapterRangeEnd  : 1,
          evidenceSnippets : ["第一回"]
        },
        {
          personaName      : "严贡生",
          normalizedLabel  : "席终后",
          timeSortKey      : null,
          chapterRangeStart: null,
          chapterRangeEnd  : null,
          evidenceSnippets : []
        }
      ]
    });

    // Act
    const evaluation = evaluateReviewRegressionFixture(fixture, snapshot, { scenarioResults: [] });

    // Assert
    expect(evaluation.metrics.timeNormalizationUsability).toEqual({
      usable      : 0,
      unusable    : 2,
      usabilityPct: 0
    });
  });

  it("returns null percentages when no comparable expectations or action results exist", () => {
    // Arrange
    const fixture = createFixture({
      personas    : [],
      chapterFacts: [],
      relations   : [],
      timeFacts   : []
    });
    const snapshot = createSnapshot({
      personas    : [],
      chapterFacts: [],
      relations   : [],
      timeFacts   : []
    });

    // Act
    const evaluation = evaluateReviewRegressionFixture(fixture, snapshot, { scenarioResults: [] });

    // Assert
    expect(evaluation).toEqual({
      metrics: {
        personaAccuracy: {
          matched    : 0,
          missing    : 0,
          unexpected : 0,
          accuracyPct: null
        },
        relationStability: {
          matched     : 0,
          missing     : 0,
          changed     : 0,
          stabilityPct: null
        },
        timeNormalizationUsability: {
          usable      : 0,
          unusable    : 0,
          usabilityPct: null
        },
        evidenceTraceability: {
          traced         : 0,
          untraced       : 0,
          traceabilityPct: null
        },
        reviewActionSuccessRate: {
          passed    : 0,
          failed    : 0,
          successPct: null
        }
      },
      missingKeys   : [],
      unexpectedKeys: [],
      changedKeys   : []
    });
  });
});
