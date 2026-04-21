import { isProjectionEligibleReviewState } from "@/server/modules/review/evidence-review/review-state";
import type {
  BuildPersonaTimeFactsInput,
  BuildTimelineEventsInput,
  PersonaTimeFactProjectionRow,
  TimeClaimProjectionSourceRow,
  TimelineEventProjectionRow
} from "@/server/modules/review/evidence-review/projections/types";

type MutablePersonaTimeFactCell = Omit<PersonaTimeFactProjectionRow, "sourceTimeClaimIds"> & {
  sourceTimeClaimIdSet: Set<string>;
};

type TimelineEventSortCell = TimelineEventProjectionRow & {
  timeSortKey  : number | null;
  sourceClaimId: string;
};

/**
 * 将 accepted 的 event/relation（且引用 accepted timeClaim）投影为 persona+time 读模型。
 */
export function buildPersonaTimeFacts(input: BuildPersonaTimeFactsInput): PersonaTimeFactProjectionRow[] {
  const acceptedTimeClaimById = buildAcceptedTimeClaimById(input.timeClaims);
  const cellByKey = new Map<string, MutablePersonaTimeFactCell>();

  for (const eventClaim of input.eventClaims) {
    if (!isProjectionEligibleReviewState(eventClaim.reviewState)) continue;
    if (eventClaim.subjectPersonaCandidateId === null) continue;

    const personaId = input.personaIdByCandidateId.get(eventClaim.subjectPersonaCandidateId);
    if (personaId === undefined) continue;

    const timeClaim = resolveAcceptedTimeClaim(
      acceptedTimeClaimById,
      eventClaim.timeHintId,
      eventClaim.bookId
    );
    if (timeClaim === undefined) continue;

    const cell = getOrCreatePersonaTimeCell(cellByKey, eventClaim.bookId, personaId, timeClaim);
    cell.eventCount += 1;
    cell.sourceTimeClaimIdSet.add(timeClaim.id);
  }

  for (const relationClaim of input.relationClaims) {
    if (!isProjectionEligibleReviewState(relationClaim.reviewState)) continue;

    const timeClaim = resolveAcceptedTimeClaim(
      acceptedTimeClaimById,
      relationClaim.timeHintId,
      relationClaim.bookId
    );
    if (timeClaim === undefined) continue;

    const personaIds = new Set<string>();
    if (relationClaim.sourcePersonaCandidateId !== null) {
      const sourcePersonaId = input.personaIdByCandidateId.get(relationClaim.sourcePersonaCandidateId);
      if (sourcePersonaId !== undefined) personaIds.add(sourcePersonaId);
    }
    if (relationClaim.targetPersonaCandidateId !== null) {
      const targetPersonaId = input.personaIdByCandidateId.get(relationClaim.targetPersonaCandidateId);
      if (targetPersonaId !== undefined) personaIds.add(targetPersonaId);
    }
    if (personaIds.size === 0) continue;

    for (const personaId of personaIds) {
      const cell = getOrCreatePersonaTimeCell(cellByKey, relationClaim.bookId, personaId, timeClaim);
      cell.relationCount += 1;
      cell.sourceTimeClaimIdSet.add(timeClaim.id);
    }
  }

  return Array.from(cellByKey.values())
    .map((cell) => ({
      bookId            : cell.bookId,
      personaId         : cell.personaId,
      timeLabel         : cell.timeLabel,
      timeSortKey       : cell.timeSortKey,
      chapterRangeStart : cell.chapterRangeStart,
      chapterRangeEnd   : cell.chapterRangeEnd,
      eventCount        : cell.eventCount,
      relationCount     : cell.relationCount,
      sourceTimeClaimIds: Array.from(cell.sourceTimeClaimIdSet).sort()
    }))
    .sort(comparePersonaTimeFacts);
}

/**
 * 将 accepted 且 timeHint 指向 accepted timeClaim 的 event 投影为时间线行。
 */
export function buildTimelineEvents(input: BuildTimelineEventsInput): TimelineEventProjectionRow[] {
  const acceptedTimeClaimById = buildAcceptedTimeClaimById(input.timeClaims);
  const rows: TimelineEventSortCell[] = [];

  for (const eventClaim of input.eventClaims) {
    if (!isProjectionEligibleReviewState(eventClaim.reviewState)) continue;
    if (eventClaim.subjectPersonaCandidateId === null) continue;

    const personaId = input.personaIdByCandidateId.get(eventClaim.subjectPersonaCandidateId);
    if (personaId === undefined) continue;

    const timeClaim = resolveAcceptedTimeClaim(
      acceptedTimeClaimById,
      eventClaim.timeHintId,
      eventClaim.bookId
    );
    if (timeClaim === undefined) continue;

    rows.push({
      bookId        : eventClaim.bookId,
      personaId,
      chapterId     : eventClaim.chapterId,
      chapterNo     : timeClaim.chapterRangeStart,
      timeLabel     : timeClaim.normalizedLabel,
      eventLabel    : buildEventLabel(eventClaim.predicate, eventClaim.objectText),
      narrativeLens : eventClaim.narrativeLens,
      sourceClaimIds: [eventClaim.id],
      timeSortKey   : timeClaim.relativeOrderWeight,
      sourceClaimId : eventClaim.id
    });
  }

  return rows
    .sort(compareTimelineEvents)
    .map((row) => ({
      bookId        : row.bookId,
      personaId     : row.personaId,
      chapterId     : row.chapterId,
      chapterNo     : row.chapterNo,
      timeLabel     : row.timeLabel,
      eventLabel    : row.eventLabel,
      narrativeLens : row.narrativeLens,
      sourceClaimIds: row.sourceClaimIds
    }));
}

function buildAcceptedTimeClaimById(
  timeClaims: readonly TimeClaimProjectionSourceRow[]
): ReadonlyMap<string, TimeClaimProjectionSourceRow> {
  const accepted = new Map<string, TimeClaimProjectionSourceRow>();
  for (const claim of timeClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    accepted.set(claim.id, claim);
  }
  return accepted;
}

function resolveAcceptedTimeClaim(
  acceptedTimeClaimById: ReadonlyMap<string, TimeClaimProjectionSourceRow>,
  timeHintId: string | null,
  bookId: string
): TimeClaimProjectionSourceRow | undefined {
  if (timeHintId === null) return undefined;
  const claim = acceptedTimeClaimById.get(timeHintId);
  if (claim === undefined) return undefined;
  if (claim.bookId !== bookId) return undefined;
  return claim;
}

function getOrCreatePersonaTimeCell(
  cellByKey: Map<string, MutablePersonaTimeFactCell>,
  bookId: string,
  personaId: string,
  timeClaim: TimeClaimProjectionSourceRow
): MutablePersonaTimeFactCell {
  const key = JSON.stringify([
    bookId,
    personaId,
    timeClaim.normalizedLabel,
    timeClaim.relativeOrderWeight,
    timeClaim.chapterRangeStart,
    timeClaim.chapterRangeEnd
  ]);

  const existing = cellByKey.get(key);
  if (existing !== undefined) return existing;

  const created: MutablePersonaTimeFactCell = {
    bookId              : bookId,
    personaId           : personaId,
    timeLabel           : timeClaim.normalizedLabel,
    timeSortKey         : timeClaim.relativeOrderWeight,
    chapterRangeStart   : timeClaim.chapterRangeStart,
    chapterRangeEnd     : timeClaim.chapterRangeEnd,
    eventCount          : 0,
    relationCount       : 0,
    sourceTimeClaimIdSet: new Set<string>()
  };
  cellByKey.set(key, created);
  return created;
}

function buildEventLabel(predicate: string, objectText: string | null): string {
  if (objectText === null) return predicate;

  const normalizedObjectText = objectText.trim();
  if (normalizedObjectText.length === 0) return predicate;
  return `${predicate}：${normalizedObjectText}`;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function comparePersonaTimeFacts(
  left: PersonaTimeFactProjectionRow,
  right: PersonaTimeFactProjectionRow
): number {
  if (left.bookId !== right.bookId) return left.bookId.localeCompare(right.bookId);
  if (left.personaId !== right.personaId) return left.personaId.localeCompare(right.personaId);

  const timeSortComparison = compareNullableNumber(left.timeSortKey, right.timeSortKey);
  if (timeSortComparison !== 0) return timeSortComparison;

  const chapterRangeStartComparison = compareNullableNumber(
    left.chapterRangeStart,
    right.chapterRangeStart
  );
  if (chapterRangeStartComparison !== 0) return chapterRangeStartComparison;

  const chapterRangeEndComparison = compareNullableNumber(left.chapterRangeEnd, right.chapterRangeEnd);
  if (chapterRangeEndComparison !== 0) return chapterRangeEndComparison;

  return left.timeLabel.localeCompare(right.timeLabel);
}

function compareTimelineEvents(left: TimelineEventSortCell, right: TimelineEventSortCell): number {
  if (left.bookId !== right.bookId) return left.bookId.localeCompare(right.bookId);
  if (left.personaId !== right.personaId) return left.personaId.localeCompare(right.personaId);

  const timeSortComparison = compareNullableNumber(left.timeSortKey, right.timeSortKey);
  if (timeSortComparison !== 0) return timeSortComparison;

  const chapterNoComparison = compareNullableNumber(left.chapterNo, right.chapterNo);
  if (chapterNoComparison !== 0) return chapterNoComparison;

  if (left.eventLabel !== right.eventLabel) return left.eventLabel.localeCompare(right.eventLabel);
  return left.sourceClaimId.localeCompare(right.sourceClaimId);
}
