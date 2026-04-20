import type {
  StageCAttributionDecision,
  StageCAttributionRankingInput,
  StageCConflictFlagRow
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

const DIRECT_CANDIDATE_SCORE = 0.9;
const CONFLICT_ALTERNATIVE_SCORE = 0.62;
const NO_SAFE_CANDIDATE_SCORE = 0.45;
const MIN_KEPT_SCORE = 0.55;

interface DecisionDraft {
  personaCandidateId: string | null;
  score             : number;
  reviewState       : StageCAttributionDecision["reviewState"];
  reasons           : string[];
  conflictFlagIds   : string[];
}

/**
 * Ranks defensible persona attributions for a root fact without collapsing ambiguity.
 * Conflict-linked alternatives are intentionally preserved so reviewers can resolve
 * attribution instead of losing evidence to a single hard choice.
 */
export function rankFactAttributionCandidates(
  input: StageCAttributionRankingInput
): StageCAttributionDecision[] {
  const candidateIds = new Set(input.personaCandidates.map((candidate) => candidate.id));
  const decisions = new Map<string, DecisionDraft>();

  if (input.directPersonaCandidateId && candidateIds.has(input.directPersonaCandidateId)) {
    const directConflictFlags = findOverlappingConflictFlags(
      input.conflictFlags,
      input.evidenceSpanIds,
      input.directPersonaCandidateId
    );

    decisions.set(input.directPersonaCandidateId, {
      personaCandidateId: input.directPersonaCandidateId,
      score             : DIRECT_CANDIDATE_SCORE,
      reviewState       : directConflictFlags.length > 0 ? "CONFLICTED" : "PENDING",
      reasons           : directConflictFlags.length > 0
        ? ["DIRECT_CANDIDATE", "CONFLICT_FLAG_RELATED"]
        : ["DIRECT_CANDIDATE"],
      conflictFlagIds: directConflictFlags.map((flag) => flag.id)
    });
  }

  for (const flag of input.conflictFlags) {
    if (!hasEvidenceOverlap(flag.evidenceSpanIds, input.evidenceSpanIds)) continue;

    for (const personaCandidateId of flag.relatedPersonaCandidateIds) {
      if (!candidateIds.has(personaCandidateId)) continue;
      if (personaCandidateId === input.directPersonaCandidateId) continue;

      const existing = decisions.get(personaCandidateId);
      const conflictFlagIds = new Set(existing?.conflictFlagIds ?? []);
      conflictFlagIds.add(flag.id);

      decisions.set(personaCandidateId, {
        personaCandidateId,
        score          : Math.max(existing?.score ?? 0, CONFLICT_ALTERNATIVE_SCORE),
        reviewState    : "CONFLICTED",
        reasons        : Array.from(new Set([...(existing?.reasons ?? []), "CONFLICT_ALTERNATIVE"])),
        conflictFlagIds: Array.from(conflictFlagIds).sort()
      });
    }
  }

  const keptDecisions = Array.from(decisions.values())
    .filter((decision) => decision.score >= MIN_KEPT_SCORE)
    .sort(compareDecisionDrafts);

  if (keptDecisions.length === 0) {
    return [{
      personaCandidateId: null,
      rank              : 1,
      score             : NO_SAFE_CANDIDATE_SCORE,
      confidence        : NO_SAFE_CANDIDATE_SCORE,
      reviewState       : "CONFLICTED",
      reason            : "NO_SAFE_CANDIDATE",
      reasons           : ["NO_SAFE_CANDIDATE"],
      conflictFlagIds   : []
    }];
  }

  return keptDecisions.map((decision, index) => ({
    personaCandidateId: decision.personaCandidateId,
    rank              : index + 1,
    score             : clampConfidence(decision.score),
    confidence        : clampConfidence(decision.score),
    reviewState       : decision.reviewState,
    reason            : decision.reasons.join("|"),
    reasons           : decision.reasons,
    conflictFlagIds   : decision.conflictFlagIds
  }));
}

function findOverlappingConflictFlags(
  conflictFlags: StageCConflictFlagRow[],
  evidenceSpanIds: string[],
  personaCandidateId: string
): StageCConflictFlagRow[] {
  return conflictFlags.filter((flag) => (
    hasEvidenceOverlap(flag.evidenceSpanIds, evidenceSpanIds)
    && flag.relatedPersonaCandidateIds.includes(personaCandidateId)
  ));
}

function hasEvidenceOverlap(leftIds: string[], rightIds: string[]): boolean {
  const rightIdSet = new Set(rightIds);
  return leftIds.some((leftId) => rightIdSet.has(leftId));
}

function compareDecisionDrafts(left: DecisionDraft, right: DecisionDraft): number {
  if (left.score !== right.score) return right.score - left.score;

  const leftId = left.personaCandidateId ?? "";
  const rightId = right.personaCandidateId ?? "";

  return leftId.localeCompare(rightId);
}

function clampConfidence(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return Number(value.toFixed(4));
}
