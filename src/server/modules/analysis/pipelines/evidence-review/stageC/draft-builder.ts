import type { ClaimReviewState } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import { rankFactAttributionCandidates } from "@/server/modules/analysis/pipelines/evidence-review/stageC/attribution-ranking";
import type {
  StageCAttributionDecision,
  StageCBuildDraftsInput,
  StageCConflictFlagRow,
  StageCDecisionRow,
  StageCDraftBundle,
  StageCEventClaimRow,
  StageCRelationClaimRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

/**
 * Converts root Stage A/A+ facts into Stage C review drafts.
 * The builder keeps attribution ambiguity as multiple derived rows, because
 * reviewers need explicit alternatives instead of hidden resolver decisions.
 */
export function buildStageCFactAttributionDrafts(
  input: StageCBuildDraftsInput
): StageCDraftBundle {
  const eventDrafts: ClaimDraftByFamily["EVENT"][] = [];
  const relationDrafts: ClaimDraftByFamily["RELATION"][] = [];
  const decisionRows: StageCDecisionRow[] = [];
  const scopedChapterIds = new Set<string>();

  for (const eventClaim of input.payload.eventClaims) {
    scopedChapterIds.add(eventClaim.chapterId);

    const subjectDecisions = rankFactAttributionCandidates({
      directPersonaCandidateId: eventClaim.subjectPersonaCandidateId,
      evidenceSpanIds         : eventClaim.evidenceSpanIds,
      personaCandidates       : input.payload.personaCandidates,
      conflictFlags           : input.payload.conflictFlags
    });
    const rootConflictFlagIds = findRootConflictFlagIds(eventClaim, input.payload.conflictFlags);

    for (const decision of subjectDecisions) {
      const reviewState = resolveDraftReviewState(decision, rootConflictFlagIds);
      const conflictFlagIds = uniqueSorted([
        ...decision.conflictFlagIds,
        ...rootConflictFlagIds
      ]);

      eventDrafts.push({
        claimFamily              : "EVENT",
        bookId                   : input.bookId,
        chapterId                : eventClaim.chapterId,
        runId                    : input.runId,
        source                   : "AI",
        confidence               : Math.min(eventClaim.confidence, decision.confidence),
        reviewState,
        createdByUserId          : null,
        reviewedByUserId         : null,
        reviewNote               : formatReviewNote(decision, conflictFlagIds, eventClaim.timeHintId),
        evidenceSpanIds          : uniqueSorted(eventClaim.evidenceSpanIds),
        supersedesClaimId        : null,
        derivedFromClaimId       : eventClaim.id,
        subjectMentionId         : eventClaim.subjectMentionId,
        subjectPersonaCandidateId: decision.personaCandidateId,
        predicate                : eventClaim.predicate,
        objectText               : eventClaim.objectText,
        objectPersonaCandidateId : eventClaim.objectPersonaCandidateId,
        locationText             : eventClaim.locationText,
        timeHintId               : eventClaim.timeHintId,
        eventCategory            : eventClaim.eventCategory,
        narrativeLens            : eventClaim.narrativeLens
      });

      decisionRows.push(toDecisionRow(eventClaim.id, "EVENT", "SUBJECT", decision, reviewState, conflictFlagIds));
    }
  }

  for (const relationClaim of input.payload.relationClaims) {
    scopedChapterIds.add(relationClaim.chapterId);

    const sourceDecisions = rankFactAttributionCandidates({
      directPersonaCandidateId: relationClaim.sourcePersonaCandidateId,
      evidenceSpanIds         : relationClaim.evidenceSpanIds,
      personaCandidates       : input.payload.personaCandidates,
      conflictFlags           : input.payload.conflictFlags
    });
    const targetDecisions = rankFactAttributionCandidates({
      directPersonaCandidateId: relationClaim.targetPersonaCandidateId,
      evidenceSpanIds         : relationClaim.evidenceSpanIds,
      personaCandidates       : input.payload.personaCandidates,
      conflictFlags           : input.payload.conflictFlags
    });
    const rootConflictFlagIds = findRootConflictFlagIds(relationClaim, input.payload.conflictFlags);

    for (const sourceDecision of sourceDecisions) {
      decisionRows.push(toDecisionRow(
        relationClaim.id,
        "RELATION",
        "SOURCE",
        sourceDecision,
        resolveDraftReviewState(sourceDecision, rootConflictFlagIds),
        uniqueSorted([...sourceDecision.conflictFlagIds, ...rootConflictFlagIds])
      ));

      for (const targetDecision of targetDecisions) {
        const conflictFlagIds = uniqueSorted([
          ...sourceDecision.conflictFlagIds,
          ...targetDecision.conflictFlagIds,
          ...rootConflictFlagIds
        ]);
        const reviewState = resolvePairReviewState(sourceDecision, targetDecision, rootConflictFlagIds);
        const confidence = Math.min(
          relationClaim.confidence,
          sourceDecision.confidence,
          targetDecision.confidence
        );

        relationDrafts.push({
          claimFamily             : "RELATION",
          bookId                  : input.bookId,
          chapterId               : relationClaim.chapterId,
          runId                   : input.runId,
          source                  : "AI",
          confidence,
          reviewState,
          createdByUserId         : null,
          reviewedByUserId        : null,
          reviewNote              : formatRelationReviewNote(sourceDecision, targetDecision, conflictFlagIds, relationClaim.timeHintId),
          evidenceSpanIds         : uniqueSorted(relationClaim.evidenceSpanIds),
          supersedesClaimId       : null,
          derivedFromClaimId      : relationClaim.id,
          sourceMentionId         : relationClaim.sourceMentionId,
          targetMentionId         : relationClaim.targetMentionId,
          sourcePersonaCandidateId: sourceDecision.personaCandidateId,
          targetPersonaCandidateId: targetDecision.personaCandidateId,
          relationTypeKey         : relationClaim.relationTypeKey,
          relationLabel           : relationClaim.relationLabel,
          relationTypeSource      : relationClaim.relationTypeSource,
          direction               : relationClaim.direction,
          effectiveChapterStart   : relationClaim.effectiveChapterStart,
          effectiveChapterEnd     : relationClaim.effectiveChapterEnd,
          timeHintId              : relationClaim.timeHintId
        });
      }
    }

    for (const targetDecision of targetDecisions) {
      decisionRows.push(toDecisionRow(
        relationClaim.id,
        "RELATION",
        "TARGET",
        targetDecision,
        resolveDraftReviewState(targetDecision, rootConflictFlagIds),
        uniqueSorted([...targetDecision.conflictFlagIds, ...rootConflictFlagIds])
      ));
    }
  }

  return {
    eventDrafts,
    relationDrafts,
    scopedChapterIds: Array.from(scopedChapterIds).sort((left, right) => left.localeCompare(right)),
    decisionRows
  };
}

function findRootConflictFlagIds(
  claim: StageCEventClaimRow | StageCRelationClaimRow,
  conflictFlags: StageCConflictFlagRow[]
): string[] {
  return conflictFlags
    .filter((flag) => flag.relatedClaimIds.includes(claim.id))
    .map((flag) => flag.id)
    .sort((left, right) => left.localeCompare(right));
}

function resolveDraftReviewState(
  decision: StageCAttributionDecision,
  rootConflictFlagIds: string[]
): ClaimReviewState {
  if (decision.reviewState === "CONFLICTED" || rootConflictFlagIds.length > 0) {
    return "CONFLICTED";
  }

  return "PENDING";
}

function resolvePairReviewState(
  sourceDecision: StageCAttributionDecision,
  targetDecision: StageCAttributionDecision,
  rootConflictFlagIds: string[]
): ClaimReviewState {
  if (
    sourceDecision.reviewState === "CONFLICTED" ||
    targetDecision.reviewState === "CONFLICTED" ||
    rootConflictFlagIds.length > 0
  ) {
    return "CONFLICTED";
  }

  return "PENDING";
}

function toDecisionRow(
  rootClaimId: string,
  claimFamily: "EVENT" | "RELATION",
  endpoint: StageCDecisionRow["endpoint"],
  decision: StageCAttributionDecision,
  reviewState: ClaimReviewState,
  conflictFlagIds: string[]
): StageCDecisionRow {
  return {
    rootClaimId,
    claimFamily,
    endpoint,
    personaCandidateId: decision.personaCandidateId,
    rank              : decision.rank,
    score             : decision.score,
    reviewState,
    reason            : decision.reason,
    conflictFlagIds
  };
}

function formatReviewNote(
  decision: StageCAttributionDecision,
  conflictFlagIds: string[],
  timeHintId: string | null
): string {
  return [
    `STAGE_C: rank=${decision.rank}`,
    `score=${decision.score}`,
    `reasons=${decision.reasons.join("|")}`,
    `conflictFlagIds=${conflictFlagIds.join("|")}`,
    `timeHintId=${timeHintId ?? "null"}`
  ].join("; ");
}

function formatRelationReviewNote(
  sourceDecision: StageCAttributionDecision,
  targetDecision: StageCAttributionDecision,
  conflictFlagIds: string[],
  timeHintId: string | null
): string {
  return [
    `STAGE_C: rank=${sourceDecision.rank}:${targetDecision.rank}`,
    `score=${sourceDecision.score}:${targetDecision.score}`,
    `reasons=${sourceDecision.reason}|${targetDecision.reason}`,
    `conflictFlagIds=${conflictFlagIds.join("|")}`,
    `timeHintId=${timeHintId ?? "null"}`
  ].join("; ");
}

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
