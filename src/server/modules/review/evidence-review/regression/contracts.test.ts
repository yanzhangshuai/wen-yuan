import { describe, expect, it } from "vitest";

import {
  getRelationExpectationNaturalKey,
  REVIEW_REGRESSION_ACTION_VALUES,
  reviewRegressionFixtureSchema,
  reviewRegressionRelationExpectationSchema
} from "./contracts";

function buildCompleteFixture(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    fixtureKey  : "rulin-waishi-mvp",
    bookTitle   : "儒林外史",
    chapterRange: { startNo: 3, endNo: 4 },
    personas    : [{
      personaName     : "范进",
      aliases         : ["范举人"],
      chapterNos      : [3],
      evidenceSnippets: ["范进进学回家"],
      pressureCases   : [{
        caseKey                : "fan-jin-identity-pressure",
        pressureType           : "MISIDENTIFICATION",
        confusedWithPersonaName: "张乡绅",
        chapterNo              : 3,
        evidenceSnippet        : "众人都称他作范老爷",
        expectedResolution     : "do-not-merge"
      }]
    }],
    chapterFacts: [{
      personaName     : "范进",
      chapterNo       : 3,
      factLabel       : "中举后被乡绅拜访",
      expectedValue   : "范进中举后身份骤变",
      evidenceSnippets: ["张乡绅来拜会新贵"]
    }],
    relations: [{
      sourcePersonaName    : "范进",
      targetPersonaName    : "张乡绅",
      relationTypeKey      : "patron_of",
      relationLabel        : "拉拢",
      direction            : "FORWARD",
      effectiveChapterStart: 3,
      effectiveChapterEnd  : 4,
      evidenceSnippets     : ["张乡绅赠银并攀谈"]
    }],
    timeFacts: [{
      personaName      : "范进",
      rawTimeText      : "中举之后",
      normalizedLabel  : "范进中举后",
      timeSortKey      : 300,
      chapterRangeStart: 3,
      chapterRangeEnd  : 4,
      isImprecise      : true,
      evidenceSnippets : ["中举之后众人改口"]
    }],
    reviewActions: [{
      scenarioKey: "accept-fan-jin-chapter-fact",
      action     : "ACCEPT_CLAIM",
      target     : {
        claimKind      : "EVENT",
        chapterNo      : 3,
        personaName    : "范进",
        evidenceSnippet: "张乡绅来拜会新贵"
      },
      expected: {
        auditAction       : "ACCEPT",
        projectionFamilies: ["persona_chapter_facts"]
      }
    }],
    rerunSamples: [{
      sampleKey              : "chapter-3-only-rerun",
      reason                 : "rerun one chapter after identity edit",
      changedChapterNos      : [3],
      expectedStableKeys     : ["persona:范进"],
      expectedChangedKeys    : ["chapterFact:范进:3:中举后被乡绅拜访"],
      comparisonFriendlyLabel: "identity pressure rerun",
      evidenceSnippets       : ["张乡绅来拜会新贵"]
    }],
    ...overrides
  };
}

describe("review regression contracts", () => {
  it("validates a complete review-native fixture with every Task 1 expectation family", () => {
    const parsed = reviewRegressionFixtureSchema.parse(buildCompleteFixture());

    expect(parsed.fixtureKey).toBe("rulin-waishi-mvp");
    expect(parsed.personas).toHaveLength(1);
    expect(parsed.chapterFacts).toHaveLength(1);
    expect(parsed.relations).toHaveLength(1);
    expect(parsed.timeFacts).toHaveLength(1);
    expect(parsed.reviewActions).toHaveLength(1);
    expect(parsed.rerunSamples).toHaveLength(1);
  });

  it("accepts an optional bookAuthor natural key for reproducible seeded baselines", () => {
    const parsed = reviewRegressionFixtureSchema.parse(buildCompleteFixture({
      bookAuthor: "吴敬梓"
    }));

    expect(parsed.bookAuthor).toBe("吴敬梓");
  });

  it("keeps relationTypeKey as an open string instead of a relation enum", () => {
    const relation = reviewRegressionRelationExpectationSchema.parse({
      sourcePersonaName    : "刘备",
      targetPersonaName    : "诸葛亮",
      relationTypeKey      : "custom_three_visits_alliance_pressure",
      relationLabel        : "三顾茅庐关系压力",
      direction            : "FORWARD",
      effectiveChapterStart: 37,
      effectiveChapterEnd  : 38,
      evidenceSnippets     : ["玄德凡三往乃见"]
    });

    expect(relation.relationTypeKey).toBe("custom_three_visits_alliance_pressure");
  });

  it("rejects non-string relationTypeKey values", () => {
    const result = reviewRegressionRelationExpectationSchema.safeParse({
      sourcePersonaName    : "刘备",
      targetPersonaName    : "诸葛亮",
      relationTypeKey      : 42,
      relationLabel        : "三顾茅庐关系压力",
      direction            : "FORWARD",
      effectiveChapterStart: 37,
      effectiveChapterEnd  : 38,
      evidenceSnippets     : ["玄德凡三往乃见"]
    });

    expect(result.success).toBe(false);
  });

  it("requires evidence snippets and chapter context on expectations", () => {
    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      personas: [{
        personaName     : "范进",
        aliases         : [],
        chapterNos      : [3],
        evidenceSnippets: []
      }]
    })).success).toBe(false);

    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      chapterFacts: [{
        personaName     : "范进",
        factLabel       : "中举后被乡绅拜访",
        evidenceSnippets: ["张乡绅来拜会新贵"]
      }]
    })).success).toBe(false);
  });

  it("rejects empty natural-key fields and inverted fixture chapter ranges", () => {
    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      fixtureKey: ""
    })).success).toBe(false);

    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      bookTitle: "   "
    })).success).toBe(false);

    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      chapterRange: { startNo: 4, endNo: 3 }
    })).success).toBe(false);

    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      relations: [{
        sourcePersonaName    : "范进",
        targetPersonaName    : "张乡绅",
        relationTypeKey      : "   ",
        relationLabel        : "拉拢",
        direction            : "FORWARD",
        effectiveChapterStart: 3,
        effectiveChapterEnd  : 4,
        evidenceSnippets     : ["张乡绅赠银并攀谈"]
      }]
    })).success).toBe(false);

    expect(reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      reviewActions: [{
        scenarioKey: "accept-fan-jin-chapter-fact",
        action     : "ACCEPT_CLAIM",
        target     : {
          claimKind      : "EVENT",
          chapterNo      : 3,
          personaName    : "范进",
          evidenceSnippet: "   "
        },
        expected: {
          auditAction       : "ACCEPT",
          projectionFamilies: ["persona_chapter_facts"]
        }
      }]
    })).success).toBe(false);
  });

  it("publishes stable review action values for the rollback-safe harness", () => {
    expect(REVIEW_REGRESSION_ACTION_VALUES).toEqual([
      "ACCEPT_CLAIM",
      "REJECT_CLAIM",
      "DEFER_CLAIM",
      "EDIT_CLAIM",
      "CREATE_MANUAL_CLAIM",
      "RELINK_EVIDENCE",
      "MERGE_PERSONA",
      "SPLIT_PERSONA"
    ]);
  });

  it("requires persona action scenarios to provide target.pair selectors", () => {
    const mergeWithoutPair = reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      reviewActions: [{
        scenarioKey: "merge-title-alias-into-fan-jin",
        action     : "MERGE_PERSONA",
        target     : {
          claimKind      : "IDENTITY",
          chapterNo      : 3,
          personaName    : "范进",
          evidenceSnippet: "众人都称他作范老爷"
        },
        expected: {
          auditAction       : "MERGE_PERSONA",
          projectionFamilies: ["relationship_edges"]
        }
      }]
    }));

    const splitWithoutPair = reviewRegressionFixtureSchema.safeParse(buildCompleteFixture({
      reviewActions: [{
        scenarioKey: "split-title-alias-from-fan-jin",
        action     : "SPLIT_PERSONA",
        target     : {
          claimKind      : "IDENTITY",
          chapterNo      : 3,
          personaName    : "范进",
          evidenceSnippet: "众人都称他作范老爷"
        },
        expected: {
          auditAction       : "SPLIT_PERSONA",
          projectionFamilies: ["relationship_edges"]
        }
      }]
    }));

    expect(mergeWithoutPair.success).toBe(false);
    expect(splitWithoutPair.success).toBe(false);
  });

  it("builds relation natural keys without UUIDs", () => {
    const parsed = reviewRegressionFixtureSchema.parse(buildCompleteFixture());
    const relation = parsed.relations[0];
    if (!relation) {
      throw new Error("Expected fixture relation");
    }

    expect(getRelationExpectationNaturalKey(relation)).toBe(
      "范进\u001f张乡绅\u001fpatron_of\u001fFORWARD\u001f3\u001f4"
    );
  });
});
