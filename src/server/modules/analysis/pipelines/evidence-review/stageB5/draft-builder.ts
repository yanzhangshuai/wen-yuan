import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { StageB5ConflictFinding } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

function uniqueSorted(values: readonly string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

export function buildStageB5ConflictDrafts(input: {
  bookId  : string;
  runId   : string;
  findings: StageB5ConflictFinding[];
}): ClaimDraftByFamily["CONFLICT_FLAG"][] {
  return input.findings
    .map((finding) => {
      const relatedChapterIds = uniqueSorted(finding.relatedChapterIds);
      const chapterId = relatedChapterIds.length === 1 ? relatedChapterIds[0] ?? null : null;

      return {
        claimFamily               : "CONFLICT_FLAG" as const,
        bookId                    : input.bookId,
        chapterId,
        runId                     : input.runId,
        conflictType              : finding.conflictType,
        severity                  : finding.severity,
        reason                    : finding.reason,
        recommendedActionKey      : finding.recommendedActionKey,
        sourceStageKey            : finding.sourceStageKey,
        relatedClaimKind          : finding.relatedClaimKind,
        relatedClaimIds           : uniqueSorted(finding.relatedClaimIds),
        relatedPersonaCandidateIds: uniqueSorted(finding.relatedPersonaCandidateIds),
        relatedChapterIds,
        summary                   : finding.summary,
        evidenceSpanIds           : uniqueSorted(finding.evidenceSpanIds),
        reviewState               : "CONFLICTED" as const,
        source                    : "RULE" as const,
        reviewedByUserId          : null,
        reviewNote                : `STAGE_B5: recommendedActionKey=${finding.recommendedActionKey}; sourceStageKey=${finding.sourceStageKey}; tags=${finding.tags.join("|")}`
      };
    })
    .sort((left, right) => left.summary.localeCompare(right.summary));
}
