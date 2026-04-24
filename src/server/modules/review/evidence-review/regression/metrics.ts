import type {
  ReviewRegressionChapterFactExpectation,
  ReviewRegressionFixture,
  ReviewRegressionMetricSummary,
  ReviewRegressionRelationExpectation,
  ReviewRegressionSnapshot,
  ReviewRegressionTimeExpectation
} from "./contracts";
import {
  getChapterFactExpectationNaturalKey,
  getRelationExpectationNaturalKey,
  getTimeExpectationNaturalKey
} from "./contracts";

const NATURAL_KEY_SEPARATOR = "\u001f";

export interface ReviewRegressionActionResultLike {
  scenarioKey: string;
  passed     : boolean;
  message    : string;
  auditAction: string | null;
}

export interface ReviewRegressionActionSummary {
  scenarioResults: readonly ReviewRegressionActionResultLike[];
}

export interface ReviewRegressionEvaluation {
  metrics       : ReviewRegressionMetricSummary;
  missingKeys   : string[];
  unexpectedKeys: string[];
  changedKeys   : string[];
}

type SnapshotPersona = ReviewRegressionSnapshot["personas"][number];
type SnapshotChapterFact = ReviewRegressionSnapshot["chapterFacts"][number];
type SnapshotRelation = ReviewRegressionSnapshot["relations"][number];
type SnapshotTimeFact = ReviewRegressionSnapshot["timeFacts"][number];

/**
 * Compares one fixture with one canonical snapshot and returns the raw metric counters plus
 * family-qualified diff keys that later reports can render without depending on DB ids.
 */
export function evaluateReviewRegressionFixture(
  expectedFixture: ReviewRegressionFixture,
  actualSnapshot: ReviewRegressionSnapshot,
  reviewActionSummary: ReviewRegressionActionSummary
): ReviewRegressionEvaluation {
  const personaDiff = comparePersonaAccuracy(expectedFixture.personas, actualSnapshot.personas);
  const relationDiff = compareRelationStability(expectedFixture.relations, actualSnapshot.relations);
  const chapterFactDiff = compareKeyedExpectations(
    expectedFixture.chapterFacts.map((fact) => prefixFamilyKey("chapterFacts", getChapterFactExpectationNaturalKey(fact))),
    actualSnapshot.chapterFacts.map((fact) => prefixFamilyKey("chapterFacts", getSnapshotChapterFactNaturalKey(fact)))
  );
  const timeFactDiff = compareKeyedExpectations(
    expectedFixture.timeFacts.map((timeFact) => prefixFamilyKey("timeFacts", getTimeExpectationNaturalKey(timeFact))),
    actualSnapshot.timeFacts.map((timeFact) => prefixFamilyKey("timeFacts", getSnapshotTimeFactNaturalKey(timeFact)))
  );

  const missingKeys = sortNaturalKeys([
    ...personaDiff.missingKeys,
    ...chapterFactDiff.missingKeys,
    ...timeFactDiff.missingKeys,
    ...relationDiff.missingKeys
  ]);
  const unexpectedKeys = sortNaturalKeys([
    ...personaDiff.unexpectedKeys,
    ...chapterFactDiff.unexpectedKeys,
    ...timeFactDiff.unexpectedKeys,
    ...relationDiff.unexpectedKeys
  ]);
  const changedKeys = sortNaturalKeys(relationDiff.changedKeys);

  return {
    metrics: {
      personaAccuracy: {
        matched    : personaDiff.matched,
        missing    : personaDiff.missing,
        unexpected : personaDiff.unexpected,
        accuracyPct: toPercentage(
          personaDiff.matched,
          personaDiff.matched + personaDiff.missing + personaDiff.unexpected
        )
      },
      relationStability: {
        matched     : relationDiff.matched,
        missing     : relationDiff.missing,
        changed     : relationDiff.changed,
        stabilityPct: toPercentage(
          relationDiff.matched,
          relationDiff.matched + relationDiff.missing + relationDiff.changed
        )
      },
      timeNormalizationUsability: buildTimeNormalizationUsability(actualSnapshot.timeFacts),
      evidenceTraceability      : buildEvidenceTraceability(actualSnapshot),
      reviewActionSuccessRate   : buildReviewActionSuccessRate(reviewActionSummary)
    },
    missingKeys,
    unexpectedKeys,
    changedKeys
  };
}

function comparePersonaAccuracy(
  expectedPersonas: ReadonlyArray<ReviewRegressionFixture["personas"][number]>,
  actualPersonas: readonly SnapshotPersona[]
) {
  const expectedKeys = new Set(expectedPersonas.map((persona) => prefixFamilyKey("personas", persona.personaName)));
  const actualKeys = new Set(actualPersonas.map((persona) => prefixFamilyKey("personas", persona.personaName)));
  const missingKeys: string[] = [];
  const unexpectedKeys: string[] = [];
  let matched = 0;

  for (const expectedKey of expectedKeys) {
    if (actualKeys.has(expectedKey)) {
      matched += 1;
    } else {
      missingKeys.push(expectedKey);
    }
  }
  for (const actualKey of actualKeys) {
    if (!expectedKeys.has(actualKey)) {
      unexpectedKeys.push(actualKey);
    }
  }

  return {
    matched,
    missing   : missingKeys.length,
    unexpected: unexpectedKeys.length,
    missingKeys,
    unexpectedKeys
  };
}

function compareRelationStability(
  expectedRelations: readonly ReviewRegressionRelationExpectation[],
  actualRelations: readonly SnapshotRelation[]
) {
  const expectedFullKeyByBase = new Map<string, string>();
  const actualFullKeyByBase = new Map<string, string>();
  const actualBaseKeysSeen = new Set<string>();
  const missingKeys: string[] = [];
  const unexpectedKeys: string[] = [];
  const changedKeys: string[] = [];
  let matched = 0;
  let changed = 0;

  for (const relation of expectedRelations) {
    expectedFullKeyByBase.set(
      getRelationComparisonBaseKey(relation.sourcePersonaName, relation.targetPersonaName, relation.relationTypeKey),
      prefixFamilyKey("relations", getRelationExpectationNaturalKey(relation))
    );
  }
  for (const relation of actualRelations) {
    actualFullKeyByBase.set(
      getRelationComparisonBaseKey(
        relation.sourcePersonaName,
        relation.targetPersonaName,
        relation.relationTypeKey
      ),
      prefixFamilyKey("relations", getSnapshotRelationNaturalKey(relation))
    );
  }

  for (const [baseKey, expectedFullKey] of expectedFullKeyByBase.entries()) {
    const actualFullKey = actualFullKeyByBase.get(baseKey);
    if (actualFullKey === undefined) {
      missingKeys.push(expectedFullKey);
      continue;
    }

    actualBaseKeysSeen.add(baseKey);
    if (actualFullKey === expectedFullKey) {
      matched += 1;
      continue;
    }

    changed += 1;
    changedKeys.push(prefixFamilyKey("relations", baseKey));
  }

  for (const [baseKey, actualFullKey] of actualFullKeyByBase.entries()) {
    if (expectedFullKeyByBase.has(baseKey) || actualBaseKeysSeen.has(baseKey)) {
      continue;
    }

    unexpectedKeys.push(actualFullKey);
  }

  return {
    matched,
    missing: missingKeys.length,
    changed,
    missingKeys,
    unexpectedKeys,
    changedKeys
  };
}

function compareKeyedExpectations(
  expectedKeys: readonly string[],
  actualKeys: readonly string[]
): { missingKeys: string[]; unexpectedKeys: string[] } {
  const actualKeySet = new Set(actualKeys);
  const expectedKeySet = new Set(expectedKeys);
  const missingKeys = expectedKeys.filter((key) => !actualKeySet.has(key));
  const unexpectedKeys = actualKeys.filter((key) => !expectedKeySet.has(key));

  return { missingKeys, unexpectedKeys };
}

function buildTimeNormalizationUsability(
  timeFacts: readonly SnapshotTimeFact[]
): ReviewRegressionMetricSummary["timeNormalizationUsability"] {
  let usable = 0;
  let unusable = 0;

  for (const timeFact of timeFacts) {
    const hasNormalizedLabel = timeFact.normalizedLabel.trim().length > 0;
    const hasChapterLinkage =
      timeFact.chapterRangeStart !== null
      || timeFact.chapterRangeEnd !== null;

    if (hasNormalizedLabel && hasChapterLinkage) {
      usable += 1;
    } else {
      unusable += 1;
    }
  }

  return {
    usable,
    unusable,
    usabilityPct: toPercentage(usable, usable + unusable)
  };
}

function buildEvidenceTraceability(
  snapshot: ReviewRegressionSnapshot
): ReviewRegressionMetricSummary["evidenceTraceability"] {
  const evidenceCollections = [
    ...snapshot.chapterFacts.map((fact) => fact.evidenceSnippets),
    ...snapshot.relations.map((relation) => relation.evidenceSnippets),
    ...snapshot.timeFacts.map((timeFact) => timeFact.evidenceSnippets)
  ];
  let traced = 0;
  let untraced = 0;

  for (const snippets of evidenceCollections) {
    const hasEvidence = snippets.some((snippet) => snippet.trim().length > 0);
    if (hasEvidence) {
      traced += 1;
    } else {
      untraced += 1;
    }
  }

  return {
    traced,
    untraced,
    traceabilityPct: toPercentage(traced, traced + untraced)
  };
}

function buildReviewActionSuccessRate(
  reviewActionSummary: ReviewRegressionActionSummary
): ReviewRegressionMetricSummary["reviewActionSuccessRate"] {
  const passed = reviewActionSummary.scenarioResults.filter((result) => result.passed).length;
  const failed = reviewActionSummary.scenarioResults.length - passed;

  return {
    passed,
    failed,
    successPct: toPercentage(passed, passed + failed)
  };
}

function getSnapshotChapterFactNaturalKey(fact: SnapshotChapterFact): string {
  const expectationLike: ReviewRegressionChapterFactExpectation = {
    personaName     : fact.personaName,
    chapterNo       : fact.chapterNo,
    factLabel       : fact.factLabel,
    evidenceSnippets: [...fact.evidenceSnippets]
  };

  return getChapterFactExpectationNaturalKey(expectationLike);
}

function getSnapshotRelationNaturalKey(relation: SnapshotRelation): string {
  const expectationLike: ReviewRegressionRelationExpectation = {
    sourcePersonaName    : relation.sourcePersonaName,
    targetPersonaName    : relation.targetPersonaName,
    relationTypeKey      : relation.relationTypeKey,
    direction            : relation.direction,
    effectiveChapterStart: relation.effectiveChapterStart,
    effectiveChapterEnd  : relation.effectiveChapterEnd,
    evidenceSnippets     : [...relation.evidenceSnippets]
  };

  return getRelationExpectationNaturalKey(expectationLike);
}

function getSnapshotTimeFactNaturalKey(timeFact: SnapshotTimeFact): string {
  const expectationLike: ReviewRegressionTimeExpectation = {
    personaName      : timeFact.personaName,
    normalizedLabel  : timeFact.normalizedLabel,
    timeSortKey      : timeFact.timeSortKey,
    chapterRangeStart: timeFact.chapterRangeStart,
    chapterRangeEnd  : timeFact.chapterRangeEnd,
    evidenceSnippets : [...timeFact.evidenceSnippets],
    isImprecise      : false
  };

  return getTimeExpectationNaturalKey(expectationLike);
}

function getRelationComparisonBaseKey(
  sourcePersonaName: string,
  targetPersonaName: string,
  relationTypeKey: string
): string {
  return [sourcePersonaName, targetPersonaName, relationTypeKey].join(NATURAL_KEY_SEPARATOR);
}

function prefixFamilyKey(family: "chapterFacts" | "personas" | "relations" | "timeFacts", key: string): string {
  return `${family}:${key}`;
}

function sortNaturalKeys(keys: readonly string[]): string[] {
  return [...keys].sort((left, right) => left.localeCompare(right));
}

function toPercentage(numerator: number, denominator: number): number | null {
  if (denominator <= 0) {
    return null;
  }

  return Number(((numerator / denominator) * 100).toFixed(1));
}
