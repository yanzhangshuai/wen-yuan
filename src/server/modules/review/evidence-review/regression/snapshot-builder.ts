import {
  buildAcceptedPersonaMapping
} from "@/server/modules/review/evidence-review/projections/projection-builder";
import { buildPersonaChapterFacts } from "@/server/modules/review/evidence-review/projections/persona-chapter";
import { buildPersonaTimeFacts, buildTimelineEvents } from "@/server/modules/review/evidence-review/projections/persona-time";
import { buildRelationshipEdges } from "@/server/modules/review/evidence-review/projections/relationships";

import type { ReviewRegressionSnapshot } from "./contracts";
import type {
  ReviewRegressionCurrentRows,
  ReviewRegressionRunScopedRows,
  ReviewRegressionSnapshotChapterSegmentRow,
  ReviewRegressionSnapshotEvidenceSpanRow,
  ReviewRegressionSnapshotFixtureContext,
  ReviewRegressionSnapshotPersonaAliasRow,
  ReviewRegressionSnapshotPersonaRow
} from "./snapshot-repository";

type EvidenceLookup = {
  evidenceSpanById: ReadonlyMap<string, ReviewRegressionSnapshotEvidenceSpanRow>;
  segmentById     : ReadonlyMap<string, ReviewRegressionSnapshotChapterSegmentRow>;
};

type PersonaLookup = {
  personaById    : ReadonlyMap<string, ReviewRegressionSnapshotPersonaRow>;
  aliasTextsById : ReadonlyMap<string, readonly string[]>;
  personaNameById: ReadonlyMap<string, string>;
};

export function buildCurrentReviewRegressionSnapshot(
  context: ReviewRegressionSnapshotFixtureContext,
  rows: ReviewRegressionCurrentRows
): ReviewRegressionSnapshot {
  const personaLookup = buildPersonaLookup(rows.personas, rows.personaAliases);
  const evidenceLookup = buildEvidenceLookup(rows.evidenceSpans, rows.chapterSegments);

  return {
    fixtureKey  : context.fixture.fixtureKey,
    bookTitle   : context.book.title,
    chapterRange: context.fixture.chapterRange,
    personas    : rows.personas.map((persona) => ({
      personaName: persona.name,
      aliases    : getAliasesForPersona(personaLookup.aliasTextsById, persona)
    })).sort(comparePersonas),
    chapterFacts: rows.timelineEvents.map((row) => ({
      personaName     : requirePersonaName(personaLookup.personaNameById, row.personaId),
      chapterNo       : row.chapterNo ?? resolveChapterNo(context, row.chapterId),
      factLabel       : row.eventLabel,
      evidenceSnippets: collectClaimEvidenceSnippets(rows.eventClaims, evidenceLookup, row.sourceClaimIds)
    })).sort(compareChapterFacts),
    relations: rows.relationshipEdges.map((row) => ({
      sourcePersonaName    : requirePersonaName(personaLookup.personaNameById, row.sourcePersonaId),
      targetPersonaName    : requirePersonaName(personaLookup.personaNameById, row.targetPersonaId),
      relationTypeKey      : row.relationTypeKey,
      direction            : row.direction,
      effectiveChapterStart: row.effectiveChapterStart,
      effectiveChapterEnd  : row.effectiveChapterEnd,
      evidenceSnippets     : collectClaimEvidenceSnippets(rows.relationClaims, evidenceLookup, row.sourceClaimIds)
    })).sort(compareRelations),
    timeFacts: rows.personaTimeFacts.map((row) => ({
      personaName      : requirePersonaName(personaLookup.personaNameById, row.personaId),
      normalizedLabel  : row.timeLabel,
      timeSortKey      : row.timeSortKey === null ? null : Math.trunc(row.timeSortKey),
      chapterRangeStart: row.chapterRangeStart,
      chapterRangeEnd  : row.chapterRangeEnd,
      evidenceSnippets : collectClaimEvidenceSnippets(rows.timeClaims, evidenceLookup, row.sourceTimeClaimIds)
    })).sort(compareTimeFacts)
  };
}

export function buildRunScopedReviewRegressionSnapshot(
  context: ReviewRegressionSnapshotFixtureContext,
  rows: ReviewRegressionRunScopedRows
): ReviewRegressionSnapshot {
  const comparisonRows = normalizeRunScopedRowsForComparison(rows);
  const requiredPersonaCandidateIds = collectRequiredPersonaCandidateIds(comparisonRows);
  const personaMapping = buildAcceptedPersonaMapping({
    identityResolutionClaims: comparisonRows.identityResolutionClaims,
    requiredPersonaCandidateIds
  });
  const personaLookup = buildPersonaLookup(rows.personas, rows.personaAliases);
  const evidenceLookup = buildEvidenceLookup(rows.evidenceSpans, rows.chapterSegments);

  const personaChapterFacts = buildPersonaChapterFacts({
    chapters              : context.chapters,
    personaIdByCandidateId: personaMapping.personaIdByCandidateId,
    eventClaims           : comparisonRows.eventClaims,
    relationClaims        : comparisonRows.relationClaims,
    conflictFlags         : comparisonRows.conflictFlags
  });
  const personaTimeFacts = buildPersonaTimeFacts({
    personaIdByCandidateId: personaMapping.personaIdByCandidateId,
    eventClaims           : comparisonRows.eventClaims,
    relationClaims        : comparisonRows.relationClaims,
    timeClaims            : comparisonRows.timeClaims
  });
  const relationshipEdges = buildRelationshipEdges({
    personaIdByCandidateId: personaMapping.personaIdByCandidateId,
    relationClaims        : comparisonRows.relationClaims
  });
  const timelineEvents = buildTimelineEvents({
    personaIdByCandidateId: personaMapping.personaIdByCandidateId,
    eventClaims           : comparisonRows.eventClaims,
    timeClaims            : comparisonRows.timeClaims
  });
  const personaIds = Array.from(new Set([
    ...personaChapterFacts.map((row) => row.personaId),
    ...personaTimeFacts.map((row) => row.personaId),
    ...relationshipEdges.flatMap((row) => [row.sourcePersonaId, row.targetPersonaId]),
    ...timelineEvents.map((row) => row.personaId)
  ])).sort();

  const personas = personaIds
    .map((personaId) => personaLookup.personaById.get(personaId))
    .filter((persona): persona is ReviewRegressionSnapshotPersonaRow => persona !== undefined)
    .map((persona) => ({
      personaName: persona.name,
      aliases    : getAliasesForPersona(personaLookup.aliasTextsById, persona)
    }));

  return {
    fixtureKey  : context.fixture.fixtureKey,
    bookTitle   : context.book.title,
    chapterRange: context.fixture.chapterRange,
    personas    : personas.sort(comparePersonas),
    chapterFacts: timelineEvents.map((row) => ({
      personaName     : requirePersonaName(personaLookup.personaNameById, row.personaId),
      chapterNo       : row.chapterNo ?? resolveChapterNo(context, row.chapterId),
      factLabel       : row.eventLabel,
      evidenceSnippets: collectClaimEvidenceSnippets(rows.eventClaims, evidenceLookup, row.sourceClaimIds)
    })).sort(compareChapterFacts),
    relations: relationshipEdges.map((row) => ({
      sourcePersonaName    : requirePersonaName(personaLookup.personaNameById, row.sourcePersonaId),
      targetPersonaName    : requirePersonaName(personaLookup.personaNameById, row.targetPersonaId),
      relationTypeKey      : row.relationTypeKey,
      direction            : row.direction,
      effectiveChapterStart: row.effectiveChapterStart,
      effectiveChapterEnd  : row.effectiveChapterEnd,
      evidenceSnippets     : collectClaimEvidenceSnippets(rows.relationClaims, evidenceLookup, row.sourceClaimIds)
    })).sort(compareRelations),
    timeFacts: personaTimeFacts.map((row) => ({
      personaName      : requirePersonaName(personaLookup.personaNameById, row.personaId),
      normalizedLabel  : row.timeLabel,
      timeSortKey      : row.timeSortKey === null ? null : Math.trunc(row.timeSortKey),
      chapterRangeStart: row.chapterRangeStart,
      chapterRangeEnd  : row.chapterRangeEnd,
      evidenceSnippets : collectClaimEvidenceSnippets(rows.timeClaims, evidenceLookup, row.sourceTimeClaimIds)
    })).sort(compareTimeFacts)
  };
}

function normalizeRunScopedRowsForComparison(
  rows: ReviewRegressionRunScopedRows
): ReviewRegressionRunScopedRows {
  return {
    ...rows,
    identityResolutionClaims: normalizeComparisonReviewStates(rows.identityResolutionClaims),
    eventClaims             : normalizeComparisonReviewStates(rows.eventClaims),
    relationClaims          : normalizeComparisonReviewStates(rows.relationClaims),
    timeClaims              : normalizeComparisonReviewStates(rows.timeClaims),
    conflictFlags           : normalizeComparisonReviewStates(rows.conflictFlags)
  };
}

function normalizeComparisonReviewStates<TClaim extends { reviewState: string }>(
  claims: readonly TClaim[]
): TClaim[] {
  return claims.map((claim) => (
    claim.reviewState === "ACCEPTED"
      ? claim
      : { ...claim, reviewState: "ACCEPTED" }
  ));
}

function buildPersonaLookup(
  personas: readonly ReviewRegressionSnapshotPersonaRow[],
  personaAliases: readonly ReviewRegressionSnapshotPersonaAliasRow[]
): PersonaLookup {
  const personaById = new Map<string, ReviewRegressionSnapshotPersonaRow>();
  const aliasTextSetById = new Map<string, Set<string>>();

  for (const persona of personas) {
    personaById.set(persona.id, persona);
    aliasTextSetById.set(persona.id, new Set(persona.aliases));
  }
  for (const alias of personaAliases) {
    const aliasTexts = aliasTextSetById.get(alias.personaId) ?? new Set<string>();
    aliasTexts.add(alias.aliasText);
    aliasTextSetById.set(alias.personaId, aliasTexts);
  }

  const aliasTextsById = new Map<string, readonly string[]>();
  const personaNameById = new Map<string, string>();

  for (const persona of personas) {
    personaNameById.set(persona.id, persona.name);
    aliasTextsById.set(persona.id, Array.from(aliasTextSetById.get(persona.id) ?? []).sort());
  }

  return { personaById, aliasTextsById, personaNameById };
}

function buildEvidenceLookup(
  evidenceSpans: readonly ReviewRegressionSnapshotEvidenceSpanRow[],
  chapterSegments: readonly ReviewRegressionSnapshotChapterSegmentRow[]
): EvidenceLookup {
  return {
    evidenceSpanById: new Map(evidenceSpans.map((span) => [span.id, span])),
    segmentById     : new Map(chapterSegments.map((segment) => [segment.id, segment]))
  };
}

function collectRequiredPersonaCandidateIds(rows: ReviewRegressionRunScopedRows): string[] {
  const candidateIds = new Set<string>();

  for (const claim of rows.eventClaims) {
    if (claim.subjectPersonaCandidateId !== null) {
      candidateIds.add(claim.subjectPersonaCandidateId);
    }
    if (claim.objectPersonaCandidateId !== null) {
      candidateIds.add(claim.objectPersonaCandidateId);
    }
  }
  for (const claim of rows.relationClaims) {
    if (claim.sourcePersonaCandidateId !== null) {
      candidateIds.add(claim.sourcePersonaCandidateId);
    }
    if (claim.targetPersonaCandidateId !== null) {
      candidateIds.add(claim.targetPersonaCandidateId);
    }
  }
  for (const conflictFlag of rows.conflictFlags) {
    for (const candidateId of conflictFlag.relatedPersonaCandidateIds) {
      candidateIds.add(candidateId);
    }
  }

  return Array.from(candidateIds).sort();
}

function collectClaimEvidenceSnippets<
  TClaim extends { id: string; evidenceSpanIds: readonly string[] }
>(
  claims: readonly TClaim[],
  evidenceLookup: EvidenceLookup,
  claimIds: readonly string[]
): string[] {
  const claimById = new Map(claims.map((claim) => [claim.id, claim]));
  const snippets = new Set<string>();

  for (const claimId of claimIds) {
    const claim = claimById.get(claimId);
    if (claim === undefined) continue;

    for (const evidenceSpanId of claim.evidenceSpanIds) {
      const snippet = resolveEvidenceSnippet(evidenceLookup, evidenceSpanId);
      if (snippet !== null) {
        snippets.add(snippet);
      }
    }
  }

  return Array.from(snippets).sort();
}

function resolveEvidenceSnippet(
  evidenceLookup: EvidenceLookup,
  evidenceSpanId: string
): string | null {
  const evidenceSpan = evidenceLookup.evidenceSpanById.get(evidenceSpanId);
  if (evidenceSpan === undefined) {
    return null;
  }

  const quotedText = evidenceSpan.quotedText.trim();
  if (quotedText.length > 0) {
    return quotedText;
  }

  const segment = evidenceLookup.segmentById.get(evidenceSpan.segmentId);
  const segmentText = segment?.text.trim() ?? "";
  return segmentText.length > 0 ? segmentText : null;
}

function getAliasesForPersona(
  aliasTextsById: ReadonlyMap<string, readonly string[]>,
  persona: ReviewRegressionSnapshotPersonaRow
): string[] {
  return [...(aliasTextsById.get(persona.id) ?? [])];
}

function requirePersonaName(personaNameById: ReadonlyMap<string, string>, personaId: string): string {
  const personaName = personaNameById.get(personaId);
  if (personaName === undefined) {
    throw new Error(`Missing persona row for regression snapshot personaId ${personaId}`);
  }
  return personaName;
}

function resolveChapterNo(
  context: ReviewRegressionSnapshotFixtureContext,
  chapterId: string | null
): number {
  if (chapterId === null) {
    throw new Error("Timeline row is missing chapterId for regression snapshot");
  }

  const chapter = context.chapters.find((item) => item.id === chapterId);
  if (chapter === undefined) {
    throw new Error(`Chapter not found in regression snapshot context: ${chapterId}`);
  }

  return chapter.no;
}

function comparePersonas(
  left: ReviewRegressionSnapshot["personas"][number],
  right: ReviewRegressionSnapshot["personas"][number]
): number {
  return compareNaturalText(left.personaName, right.personaName);
}

function compareChapterFacts(
  left: ReviewRegressionSnapshot["chapterFacts"][number],
  right: ReviewRegressionSnapshot["chapterFacts"][number]
): number {
  return compareNaturalText(left.personaName, right.personaName)
    || left.chapterNo - right.chapterNo
    || compareNaturalText(left.factLabel, right.factLabel);
}

function compareRelations(
  left: ReviewRegressionSnapshot["relations"][number],
  right: ReviewRegressionSnapshot["relations"][number]
): number {
  return compareNaturalText(left.sourcePersonaName, right.sourcePersonaName)
    || compareNaturalText(left.targetPersonaName, right.targetPersonaName)
    || left.relationTypeKey.localeCompare(right.relationTypeKey)
    || left.direction.localeCompare(right.direction)
    || compareNullableNumber(left.effectiveChapterStart, right.effectiveChapterStart)
    || compareNullableNumber(left.effectiveChapterEnd, right.effectiveChapterEnd);
}

function compareTimeFacts(
  left: ReviewRegressionSnapshot["timeFacts"][number],
  right: ReviewRegressionSnapshot["timeFacts"][number]
): number {
  return compareNaturalText(left.personaName, right.personaName)
    || compareNullableNumber(left.timeSortKey, right.timeSortKey)
    || compareNullableNumber(left.chapterRangeStart, right.chapterRangeStart)
    || compareNullableNumber(left.chapterRangeEnd, right.chapterRangeEnd)
    || compareNaturalText(left.normalizedLabel, right.normalizedLabel);
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === right) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareNaturalText(left: string, right: string): number {
  return left.localeCompare(right, "zh-Hans-CN");
}
