import {
  isProjectionEligibleReviewState,
  type ClaimReviewState
} from "@/server/modules/review/evidence-review/review-state";
import type {
  BuildPersonaChapterFactsInput,
  PersonaChapterFactProjectionRow,
  PersonaChapterReviewStateFamily
} from "@/server/modules/review/evidence-review/projections/types";

const EVENT_FAMILY: PersonaChapterReviewStateFamily = "EVENT";
const RELATION_FAMILY: PersonaChapterReviewStateFamily = "RELATION";
const CONFLICT_FAMILY: PersonaChapterReviewStateFamily = "CONFLICT";

type MutablePersonaChapterCell = PersonaChapterFactProjectionRow;

/**
 * 将可投影的 event/relation/conflict 聚合为 persona+chapter 读模型行。
 */
export function buildPersonaChapterFacts(
  input: BuildPersonaChapterFactsInput
): PersonaChapterFactProjectionRow[] {
  const chapterNoById = new Map<string, number>();
  for (const chapter of input.chapters) {
    chapterNoById.set(chapter.id, chapter.no);
  }

  const cellByKey = new Map<string, MutablePersonaChapterCell>();

  for (const eventClaim of input.eventClaims) {
    if (!isProjectionEligibleReviewState(eventClaim.reviewState)) continue;
    if (eventClaim.subjectPersonaCandidateId === null) continue;

    const personaId = input.personaIdByCandidateId.get(eventClaim.subjectPersonaCandidateId);
    if (personaId === undefined) continue;

    const chapterNo = chapterNoById.get(eventClaim.chapterId);
    if (chapterNo === undefined) continue;

    const cell = getOrCreateCell(cellByKey, {
      bookId      : eventClaim.bookId,
      personaId,
      chapterId   : eventClaim.chapterId,
      chapterNo,
      latestAtSeed: eventClaim.updatedAt
    });
    cell.eventCount += 1;
    incrementReviewStateSummary(cell, EVENT_FAMILY, eventClaim.reviewState);
    updateLatestUpdatedAt(cell, eventClaim.updatedAt);
  }

  for (const relationClaim of input.relationClaims) {
    if (!isProjectionEligibleReviewState(relationClaim.reviewState)) continue;

    const chapterNo = chapterNoById.get(relationClaim.chapterId);
    if (chapterNo === undefined) continue;

    const personaIds = new Set<string>();
    if (relationClaim.sourcePersonaCandidateId !== null) {
      const sourcePersonaId = input.personaIdByCandidateId.get(relationClaim.sourcePersonaCandidateId);
      if (sourcePersonaId !== undefined) {
        personaIds.add(sourcePersonaId);
      }
    }
    if (relationClaim.targetPersonaCandidateId !== null) {
      const targetPersonaId = input.personaIdByCandidateId.get(relationClaim.targetPersonaCandidateId);
      if (targetPersonaId !== undefined) {
        personaIds.add(targetPersonaId);
      }
    }

    for (const personaId of personaIds) {
      const cell = getOrCreateCell(cellByKey, {
        bookId      : relationClaim.bookId,
        personaId,
        chapterId   : relationClaim.chapterId,
        chapterNo,
        latestAtSeed: relationClaim.updatedAt
      });
      cell.relationCount += 1;
      incrementReviewStateSummary(cell, RELATION_FAMILY, relationClaim.reviewState);
      updateLatestUpdatedAt(cell, relationClaim.updatedAt);
    }
  }

  for (const conflictFlag of input.conflictFlags) {
    if (!isProjectionEligibleReviewState(conflictFlag.reviewState)) continue;

    const chapterIds = resolveConflictChapterIds(conflictFlag.relatedChapterIds, conflictFlag.chapterId);
    if (chapterIds.length === 0) continue;

    const personaIds = new Set<string>();
    for (const candidateId of conflictFlag.relatedPersonaCandidateIds) {
      const personaId = input.personaIdByCandidateId.get(candidateId);
      if (personaId !== undefined) {
        personaIds.add(personaId);
      }
    }
    if (personaIds.size === 0) continue;

    for (const chapterId of chapterIds) {
      const chapterNo = chapterNoById.get(chapterId);
      if (chapterNo === undefined) continue;

      for (const personaId of personaIds) {
        const cell = getOrCreateCell(cellByKey, {
          bookId      : conflictFlag.bookId,
          personaId,
          chapterId,
          chapterNo,
          latestAtSeed: conflictFlag.updatedAt
        });
        cell.conflictCount += 1;
        incrementReviewStateSummary(cell, CONFLICT_FAMILY, conflictFlag.reviewState);
        updateLatestUpdatedAt(cell, conflictFlag.updatedAt);
      }
    }
  }

  return Array.from(cellByKey.values()).sort(comparePersonaChapterRows);
}

function getOrCreateCell(
  cellByKey: Map<string, MutablePersonaChapterCell>,
  input: {
    bookId      : string;
    personaId   : string;
    chapterId   : string;
    chapterNo   : number;
    latestAtSeed: Date;
  }
): MutablePersonaChapterCell {
  const key = `${input.bookId}|${input.personaId}|${input.chapterNo}|${input.chapterId}`;
  const existingCell = cellByKey.get(key);
  if (existingCell !== undefined) {
    return existingCell;
  }

  const createdCell: MutablePersonaChapterCell = {
    bookId            : input.bookId,
    personaId         : input.personaId,
    chapterId         : input.chapterId,
    chapterNo         : input.chapterNo,
    eventCount        : 0,
    relationCount     : 0,
    conflictCount     : 0,
    reviewStateSummary: {},
    latestUpdatedAt   : input.latestAtSeed
  };
  cellByKey.set(key, createdCell);
  return createdCell;
}

function incrementReviewStateSummary(
  cell: MutablePersonaChapterCell,
  family: PersonaChapterReviewStateFamily,
  reviewState: ClaimReviewState
): void {
  const familySummary = cell.reviewStateSummary[family] ?? {};
  const currentCount = familySummary[reviewState] ?? 0;
  familySummary[reviewState] = currentCount + 1;
  cell.reviewStateSummary[family] = familySummary;
}

function updateLatestUpdatedAt(cell: MutablePersonaChapterCell, candidate: Date): void {
  if (candidate.getTime() > cell.latestUpdatedAt.getTime()) {
    cell.latestUpdatedAt = candidate;
  }
}

function resolveConflictChapterIds(
  relatedChapterIds: readonly string[],
  fallbackChapterId: string | null
): readonly string[] {
  if (relatedChapterIds.length > 0) {
    return Array.from(new Set(relatedChapterIds));
  }
  if (fallbackChapterId === null) {
    return [];
  }
  return [fallbackChapterId];
}

function comparePersonaChapterRows(
  left: PersonaChapterFactProjectionRow,
  right: PersonaChapterFactProjectionRow
): number {
  if (left.bookId !== right.bookId) {
    return left.bookId.localeCompare(right.bookId);
  }
  if (left.personaId !== right.personaId) {
    return left.personaId.localeCompare(right.personaId);
  }
  if (left.chapterNo !== right.chapterNo) {
    return left.chapterNo - right.chapterNo;
  }
  return left.chapterId.localeCompare(right.chapterId);
}
