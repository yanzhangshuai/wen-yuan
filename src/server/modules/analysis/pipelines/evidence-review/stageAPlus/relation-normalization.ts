import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import {
  findRelationNegativeRule,
  suggestRelationTypeByLabel,
  type RelationTypeCatalog
} from "@/server/modules/knowledge-v2/relation-types";
import {
  reviewNoteForKnowledge,
  STAGE_A_PLUS_CONFIDENCE,
  type StageAPlusRelationClaimRow,
  type StageAPlusRecallOutput
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function relationConfidence(baseConfidence: number, ruleConfidence: number): number {
  return Math.min(
    1,
    Math.max(ruleConfidence, baseConfidence + STAGE_A_PLUS_CONFIDENCE.RELATION_BOOST)
  );
}

function relationKnowledgeRef(input: {
  knowledgeItemId: string | null;
  relationTypeKey: string;
}): string {
  return input.knowledgeItemId ?? `system-preset:${input.relationTypeKey}`;
}

export function normalizeStageAPlusRelations(input: {
  bookId         : string;
  chapterId      : string;
  runId          : string;
  relations      : StageAPlusRelationClaimRow[];
  relationCatalog: RelationTypeCatalog;
}): Pick<StageAPlusRecallOutput, "relationDrafts" | "discardRecords" | "knowledgeItemIds"> {
  const relationDrafts: StageAPlusRecallOutput["relationDrafts"] = [];
  const knowledgeItemIds: string[] = [];
  const knowledgeIdsSeen = new Set<string>();

  function recordKnowledgeId(knowledgeId: string): void {
    if (knowledgeIdsSeen.has(knowledgeId)) {
      return;
    }

    knowledgeIdsSeen.add(knowledgeId);
    knowledgeItemIds.push(knowledgeId);
  }

  for (const relation of input.relations) {
    const negativeRule = findRelationNegativeRule({
      catalog      : input.relationCatalog,
      relationLabel: relation.relationLabel,
      direction    : relation.direction
    });

    if (negativeRule) {
      relationDrafts.push(
        validateClaimDraftByFamily("RELATION", {
          claimFamily     : "RELATION",
          bookId          : input.bookId,
          chapterId       : input.chapterId,
          runId           : input.runId,
          source          : "RULE",
          reviewState     : "CONFLICTED",
          createdByUserId : null,
          reviewedByUserId: null,
          reviewNote      : reviewNoteForKnowledge(
            "KB_RELATION_NEGATIVE",
            negativeRule.id,
            `relationLabel=${relation.relationLabel}; reason=${negativeRule.reason}`
          ),
          supersedesClaimId : null,
          derivedFromClaimId: relation.id,
          evidenceSpanIds   : relation.evidenceSpanIds,
          confidence        : Math.max(
            negativeRule.confidence,
            STAGE_A_PLUS_CONFIDENCE.NEGATIVE_KB
          ),
          sourceMentionId         : relation.sourceMentionId,
          targetMentionId         : relation.targetMentionId,
          sourcePersonaCandidateId: relation.sourcePersonaCandidateId,
          targetPersonaCandidateId: relation.targetPersonaCandidateId,
          relationTypeKey         : negativeRule.relationTypeKey ?? relation.relationTypeKey,
          relationLabel           : relation.relationLabel,
          relationTypeSource      : relation.relationTypeSource,
          direction               : relation.direction,
          effectiveChapterStart   : relation.effectiveChapterStart,
          effectiveChapterEnd     : relation.effectiveChapterEnd,
          timeHintId              : relation.timeHintId
        })
      );
      recordKnowledgeId(negativeRule.id);
      continue;
    }

    const suggestion = suggestRelationTypeByLabel({
      catalog      : input.relationCatalog,
      relationLabel: relation.relationLabel,
      direction    : relation.direction
    });

    if (!suggestion) {
      continue;
    }

    relationDrafts.push(
      validateClaimDraftByFamily("RELATION", {
        claimFamily     : "RELATION",
        bookId          : input.bookId,
        chapterId       : input.chapterId,
        runId           : input.runId,
        source          : "RULE",
        reviewState     : "PENDING",
        createdByUserId : null,
        reviewedByUserId: null,
        reviewNote      : suggestion.reviewState === "PENDING"
          ? reviewNoteForKnowledge(
            "KB_PENDING_HINT",
            relationKnowledgeRef({
              knowledgeItemId: suggestion.knowledgeItemId,
              relationTypeKey: suggestion.relationTypeKey
            }),
            `relationLabel=${relation.relationLabel}; relationTypeKey=${suggestion.relationTypeKey}`
          )
          : reviewNoteForKnowledge(
            "KB_VERIFIED",
            relationKnowledgeRef({
              knowledgeItemId: suggestion.knowledgeItemId,
              relationTypeKey: suggestion.relationTypeKey
            }),
            `relationLabel=${relation.relationLabel}; relationTypeKey=${suggestion.relationTypeKey}`
          ),
        supersedesClaimId : null,
        derivedFromClaimId: relation.id,
        evidenceSpanIds   : relation.evidenceSpanIds,
        confidence        : suggestion.reviewState === "PENDING"
          ? suggestion.confidence
          : relationConfidence(relation.confidence, suggestion.confidence),
        sourceMentionId         : relation.sourceMentionId,
        targetMentionId         : relation.targetMentionId,
        sourcePersonaCandidateId: relation.sourcePersonaCandidateId,
        targetPersonaCandidateId: relation.targetPersonaCandidateId,
        relationTypeKey         : suggestion.relationTypeKey,
        relationLabel           : relation.relationLabel,
        relationTypeSource      : suggestion.relationTypeSource === "PRESET"
          ? "PRESET"
          : "NORMALIZED_FROM_CUSTOM",
        direction            : relation.direction,
        effectiveChapterStart: relation.effectiveChapterStart,
        effectiveChapterEnd  : relation.effectiveChapterEnd,
        timeHintId           : relation.timeHintId
      })
    );

    if (suggestion.knowledgeItemId !== null) {
      recordKnowledgeId(suggestion.knowledgeItemId);
    }
  }

  return {
    relationDrafts,
    discardRecords: [],
    knowledgeItemIds
  };
}
