import { isProjectionEligibleReviewState } from "@/server/modules/review/evidence-review/review-state";
import type {
  BuildRelationshipEdgesInput,
  RelationshipEdgeProjectionRow
} from "@/server/modules/review/evidence-review/projections/types";

type MutableRelationshipEdgeCell = Omit<RelationshipEdgeProjectionRow, "sourceClaimIds"> & {
  sourceClaimIdSet: Set<string>;
  latestUpdatedAt : Date;
};

/**
 * 将可投影 relation claims 聚合为 relationship edge，支持按 persona pair/type 精确筛选。
 */
export function buildRelationshipEdges(
  input: BuildRelationshipEdgesInput
): RelationshipEdgeProjectionRow[] {
  const rowByKey = new Map<string, MutableRelationshipEdgeCell>();

  for (const claim of input.relationClaims) {
    if (!isProjectionEligibleReviewState(claim.reviewState)) continue;
    if (claim.sourcePersonaCandidateId === null || claim.targetPersonaCandidateId === null) continue;

    const sourcePersonaId = input.personaIdByCandidateId.get(claim.sourcePersonaCandidateId);
    const targetPersonaId = input.personaIdByCandidateId.get(claim.targetPersonaCandidateId);
    if (sourcePersonaId === undefined || targetPersonaId === undefined) continue;

    const key = JSON.stringify([
      claim.bookId,
      sourcePersonaId,
      targetPersonaId,
      claim.relationTypeKey,
      claim.direction,
      claim.effectiveChapterStart,
      claim.effectiveChapterEnd
    ]);

    const existing = rowByKey.get(key);
    if (existing === undefined) {
      rowByKey.set(key, {
        bookId               : claim.bookId,
        sourcePersonaId,
        targetPersonaId,
        relationTypeKey      : claim.relationTypeKey,
        relationLabel        : claim.relationLabel,
        relationTypeSource   : claim.relationTypeSource,
        direction            : claim.direction,
        effectiveChapterStart: claim.effectiveChapterStart,
        effectiveChapterEnd  : claim.effectiveChapterEnd,
        sourceClaimIdSet     : new Set<string>([claim.id]),
        latestClaimId        : claim.id,
        latestUpdatedAt      : claim.updatedAt
      });
      continue;
    }

    existing.sourceClaimIdSet.add(claim.id);
    if (
      claim.updatedAt.getTime() > existing.latestUpdatedAt.getTime() ||
      (claim.updatedAt.getTime() === existing.latestUpdatedAt.getTime() &&
        claim.id.localeCompare(existing.latestClaimId ?? "") > 0)
    ) {
      existing.latestUpdatedAt = claim.updatedAt;
      existing.latestClaimId = claim.id;
    }
  }

  return Array.from(rowByKey.values())
    .filter((row) => matchSelection(row, input.selection))
    .map((row) => ({
      bookId               : row.bookId,
      sourcePersonaId      : row.sourcePersonaId,
      targetPersonaId      : row.targetPersonaId,
      relationTypeKey      : row.relationTypeKey,
      relationLabel        : row.relationLabel,
      relationTypeSource   : row.relationTypeSource,
      direction            : row.direction,
      effectiveChapterStart: row.effectiveChapterStart,
      effectiveChapterEnd  : row.effectiveChapterEnd,
      sourceClaimIds       : Array.from(row.sourceClaimIdSet).sort(),
      latestClaimId        : row.latestClaimId
    }))
    .sort(compareRelationshipEdges);
}

function matchSelection(
  row: Pick<RelationshipEdgeProjectionRow, "sourcePersonaId" | "targetPersonaId" | "relationTypeKey">,
  selection: BuildRelationshipEdgesInput["selection"]
): boolean {
  if (selection === undefined) return true;
  if (row.sourcePersonaId !== selection.sourcePersonaId) return false;
  if (row.targetPersonaId !== selection.targetPersonaId) return false;
  if (selection.relationTypeKey !== undefined && row.relationTypeKey !== selection.relationTypeKey) {
    return false;
  }
  return true;
}

function compareNullableNumber(left: number | null, right: number | null): number {
  if (left === null && right === null) return 0;
  if (left === null) return 1;
  if (right === null) return -1;
  return left - right;
}

function compareRelationshipEdges(
  left: RelationshipEdgeProjectionRow,
  right: RelationshipEdgeProjectionRow
): number {
  if (left.bookId !== right.bookId) return left.bookId.localeCompare(right.bookId);
  if (left.sourcePersonaId !== right.sourcePersonaId) {
    return left.sourcePersonaId.localeCompare(right.sourcePersonaId);
  }
  if (left.targetPersonaId !== right.targetPersonaId) {
    return left.targetPersonaId.localeCompare(right.targetPersonaId);
  }
  if (left.relationTypeKey !== right.relationTypeKey) {
    return left.relationTypeKey.localeCompare(right.relationTypeKey);
  }
  if (left.direction !== right.direction) return left.direction.localeCompare(right.direction);

  const startComparison = compareNullableNumber(left.effectiveChapterStart, right.effectiveChapterStart);
  if (startComparison !== 0) return startComparison;

  return compareNullableNumber(left.effectiveChapterEnd, right.effectiveChapterEnd);
}
