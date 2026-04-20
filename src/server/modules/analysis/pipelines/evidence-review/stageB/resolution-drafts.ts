import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type {
  StageBCandidateCluster,
  StageBPendingIdentityResolutionDraft,
  StageBResolutionDraftBundle
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

type StageBResolutionDecision = {
  resolutionKind: "RESOLVES_TO" | "MERGE_INTO" | "SPLIT_FROM" | "UNSURE";
  reviewState   : "PENDING" | "CONFLICTED";
  confidence    : number;
  rationale     : string;
};

function uniqueOrdered<T>(items: T[]): T[] {
  return Array.from(new Set(items));
}

function clampConfidence(value: number): number {
  return Math.min(1, Math.max(0, Number(value.toFixed(4))));
}

function selectCanonicalLabel(cluster: StageBCandidateCluster): string {
  if (cluster.canonicalHints.length === 1) {
    return cluster.canonicalHints[0];
  }

  const namedMention = cluster.mentions.find((mention) => (
    mention.mentionKind === "NAMED" || mention.mentionKind === "COURTESY_NAME"
  ));

  return namedMention?.surfaceText ?? cluster.mentions[0]?.surfaceText ?? cluster.candidateRef;
}

function firstSeenChapterNo(cluster: StageBCandidateCluster): number | null {
  if (cluster.mentions.length === 0) {
    return null;
  }

  return Math.min(...cluster.mentions.map((mention) => mention.chapterNo));
}

function lastSeenChapterNo(cluster: StageBCandidateCluster): number | null {
  if (cluster.mentions.length === 0) {
    return null;
  }

  return Math.max(...cluster.mentions.map((mention) => mention.chapterNo));
}

function hasAnyBlockReason(
  cluster: StageBCandidateCluster,
  reasons: StageBCandidateCluster["blockReasons"]
): boolean {
  return reasons.some((reason) => cluster.blockReasons.includes(reason));
}

function decideResolution(cluster: StageBCandidateCluster): StageBResolutionDecision {
  if (hasAnyBlockReason(cluster, ["IMPERSONATION", "MISIDENTIFICATION"])) {
    return {
      resolutionKind: "UNSURE",
      reviewState   : "CONFLICTED",
      confidence    : clampConfidence(Math.min(0.55, cluster.mergeConfidence)),
      rationale     : "Identity conflict requires human review before merge."
    };
  }

  if (hasAnyBlockReason(cluster, [
    "NEGATIVE_ALIAS_RULE",
    "CONFLICTING_CANONICAL_HINTS",
    "SUSPECTED_RESOLVES_TO_CONFLICT"
  ])) {
    return {
      resolutionKind: "SPLIT_FROM",
      reviewState   : "PENDING",
      confidence    : clampConfidence(Math.max(0.6, cluster.mergeConfidence)),
      rationale     : "Keep separate because deterministic signals disagree or block the merge."
    };
  }

  if (cluster.blockReasons.includes("TITLE_ONLY_AMBIGUITY")) {
    return {
      resolutionKind: "UNSURE",
      reviewState   : "CONFLICTED",
      confidence    : clampConfidence(Math.min(0.55, cluster.mergeConfidence)),
      rationale     : "Title-only mention is ambiguous and needs human identity review."
    };
  }

  if (hasAnySupportReason(cluster, ["SUSPECTED_RESOLVES_TO", "KB_ALIAS_EQUIVALENCE"])) {
    return {
      resolutionKind: "RESOLVES_TO",
      reviewState   : "PENDING",
      confidence    : clampConfidence(Math.max(0.82, cluster.mergeConfidence)),
      rationale     : "Resolved by strong deterministic identity hints."
    };
  }

  if (hasAnySupportReason(cluster, ["KB_ALIAS_PENDING_HINT", "EXACT_NAMED_SURFACE"])) {
    return {
      resolutionKind: "MERGE_INTO",
      reviewState   : "PENDING",
      confidence    : clampConfidence(Math.max(0.68, cluster.mergeConfidence)),
      rationale     : "Merged conservatively from repeated named-surface or pending alias evidence."
    };
  }

  return {
    resolutionKind: "UNSURE",
    reviewState   : "CONFLICTED",
    confidence    : clampConfidence(Math.min(0.55, cluster.mergeConfidence)),
    rationale     : "Not enough stable evidence to choose a unique identity."
  };
}

function hasAnySupportReason(
  cluster: StageBCandidateCluster,
  reasons: StageBCandidateCluster["supportReasons"]
): boolean {
  return reasons.some((reason) => cluster.supportReasons.includes(reason));
}

function buildReviewNote(cluster: StageBCandidateCluster): string {
  const support = cluster.supportReasons.length > 0
    ? cluster.supportReasons.join("|")
    : "NONE";
  const blocks = cluster.blockReasons.length > 0
    ? cluster.blockReasons.join("|")
    : "NONE";

  return `STAGE_B: support=${support}; blocks=${blocks}`;
}

function buildPendingDraftsForCluster(input: {
  bookId : string;
  runId  : string;
  cluster: StageBCandidateCluster;
}): StageBPendingIdentityResolutionDraft[] {
  const decision = decideResolution(input.cluster);

  return input.cluster.mentions.map((mention) => ({
    candidateRef: input.cluster.candidateRef,
    draft       : validateClaimDraftByFamily("IDENTITY_RESOLUTION", {
      claimFamily       : "IDENTITY_RESOLUTION",
      bookId            : input.bookId,
      chapterId         : mention.chapterId,
      runId             : input.runId,
      source            : "AI",
      reviewState       : decision.reviewState,
      createdByUserId   : null,
      reviewedByUserId  : null,
      reviewNote        : buildReviewNote(input.cluster),
      supersedesClaimId : null,
      derivedFromClaimId: null,
      evidenceSpanIds   : uniqueOrdered([
        mention.evidenceSpanId,
        ...input.cluster.supportEvidenceSpanIds
      ]),
      confidence        : decision.confidence,
      mentionId         : mention.id,
      personaCandidateId: null,
      resolvedPersonaId : null,
      resolutionKind    : decision.resolutionKind,
      rationale         : decision.rationale
    })
  }));
}

export function buildStageBResolutionDraftBundle(input: {
  bookId  : string;
  runId   : string;
  clusters: StageBCandidateCluster[];
}): StageBResolutionDraftBundle {
  const personaCandidates = input.clusters.map((cluster) => ({
    candidateRef      : cluster.candidateRef,
    canonicalLabel    : selectCanonicalLabel(cluster),
    candidateStatus   : "OPEN" as const,
    firstSeenChapterNo: firstSeenChapterNo(cluster),
    lastSeenChapterNo : lastSeenChapterNo(cluster),
    mentionCount      : cluster.mentions.length,
    evidenceScore     : clampConfidence(cluster.mergeConfidence)
  }));

  return {
    personaCandidates,
    identityResolutionDrafts: input.clusters.flatMap((cluster) => buildPendingDraftsForCluster({
      bookId: input.bookId,
      runId : input.runId,
      cluster
    }))
  };
}
