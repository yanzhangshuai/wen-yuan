import type {
  ReviewRunCostComparisonDto,
  ReviewRunCostSummaryDto
} from "@/server/modules/review/evidence-review/costs/types";
import { compareReviewRunCostSummaries } from "@/server/modules/review/evidence-review/costs/cost-comparison-service";

import type {
  ReviewRegressionChapterFactExpectation,
  ReviewRegressionRelationExpectation,
  ReviewRegressionRunComparison,
  ReviewRegressionSnapshot,
  ReviewRegressionTimeExpectation
} from "./contracts";
import {
  getChapterFactExpectationNaturalKey,
  getRelationExpectationNaturalKey,
  getTimeExpectationNaturalKey
} from "./contracts";

type SnapshotPersona = ReviewRegressionSnapshot["personas"][number];
type SnapshotChapterFact = ReviewRegressionSnapshot["chapterFacts"][number];
type SnapshotRelation = ReviewRegressionSnapshot["relations"][number];
type SnapshotTimeFact = ReviewRegressionSnapshot["timeFacts"][number];

export interface CompareReviewRegressionRunsInput {
  baselineRunId?       : string;
  candidateRunId?      : string;
  baselineSnapshot     : ReviewRegressionSnapshot;
  candidateSnapshot    : ReviewRegressionSnapshot;
  baselineCostSummary? : ReviewRunCostSummaryDto | null;
  candidateCostSummary?: ReviewRunCostSummaryDto | null;
}

/**
 * Builds a diff-friendly comparison between two canonical snapshots and optionally
 * merges the existing T19 cost comparison so later reports can quote both truth drift and cost drift.
 */
export function compareReviewRegressionRuns(
  input: CompareReviewRegressionRunsInput
): ReviewRegressionRunComparison | null {
  const baselineRunId = input.baselineRunId ?? input.baselineCostSummary?.runId ?? null;
  const candidateRunId = input.candidateRunId ?? input.candidateCostSummary?.runId ?? null;

  if (baselineRunId === null || candidateRunId === null) {
    return null;
  }

  const baselineEntries = buildSnapshotEntryMap(input.baselineSnapshot);
  const candidateEntries = buildSnapshotEntryMap(input.candidateSnapshot);
  const addedKeys = sortNaturalKeys(
    Array.from(candidateEntries.keys()).filter((key) => !baselineEntries.has(key))
  );
  const removedKeys = sortNaturalKeys(
    Array.from(baselineEntries.keys()).filter((key) => !candidateEntries.has(key))
  );
  const changedKeys = sortNaturalKeys(
    Array.from(baselineEntries.keys()).filter((key) => {
      const baselinePayload = baselineEntries.get(key);
      const candidatePayload = candidateEntries.get(key);

      return candidatePayload !== undefined && candidatePayload !== baselinePayload;
    })
  );
  const costComparison = buildCostComparison(input.baselineCostSummary, input.candidateCostSummary);

  return {
    baselineRunId,
    candidateRunId,
    snapshotDiff: {
      identical: addedKeys.length === 0 && removedKeys.length === 0 && changedKeys.length === 0,
      addedKeys,
      removedKeys,
      changedKeys
    },
    costComparison
  };
}

function buildSnapshotEntryMap(snapshot: ReviewRegressionSnapshot): Map<string, string> {
  const entries = new Map<string, string>();

  for (const persona of snapshot.personas) {
    entries.set(prefixFamilyKey("personas", persona.personaName), serializeSnapshotPersona(persona));
  }
  for (const fact of snapshot.chapterFacts) {
    entries.set(
      prefixFamilyKey("chapterFacts", getSnapshotChapterFactNaturalKey(fact)),
      serializeEvidencePayload(fact.evidenceSnippets)
    );
  }
  for (const relation of snapshot.relations) {
    entries.set(
      prefixFamilyKey("relations", getSnapshotRelationNaturalKey(relation)),
      serializeEvidencePayload(relation.evidenceSnippets)
    );
  }
  for (const timeFact of snapshot.timeFacts) {
    entries.set(
      prefixFamilyKey("timeFacts", getSnapshotTimeFactNaturalKey(timeFact)),
      serializeSnapshotTimeFact(timeFact)
    );
  }

  return entries;
}

function serializeSnapshotPersona(persona: SnapshotPersona): string {
  return JSON.stringify({
    aliases: [...persona.aliases].sort()
  });
}

function serializeEvidencePayload(evidenceSnippets: readonly string[]): string {
  return JSON.stringify({
    evidenceSnippets: [...evidenceSnippets].sort()
  });
}

function serializeSnapshotTimeFact(timeFact: SnapshotTimeFact): string {
  return JSON.stringify({
    timeSortKey     : timeFact.timeSortKey,
    evidenceSnippets: [...timeFact.evidenceSnippets].sort()
  });
}

function buildCostComparison(
  baselineCostSummary: ReviewRunCostSummaryDto | null | undefined,
  candidateCostSummary: ReviewRunCostSummaryDto | null | undefined
): ReviewRunCostComparisonDto | null {
  if (baselineCostSummary === undefined || baselineCostSummary === null) {
    return null;
  }
  if (candidateCostSummary === undefined || candidateCostSummary === null) {
    return null;
  }

  return compareReviewRunCostSummaries(baselineCostSummary, candidateCostSummary);
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

function prefixFamilyKey(family: "chapterFacts" | "personas" | "relations" | "timeFacts", key: string): string {
  return `${family}:${key}`;
}

function sortNaturalKeys(keys: readonly string[]): string[] {
  return [...keys].sort((left, right) => left.localeCompare(right));
}
