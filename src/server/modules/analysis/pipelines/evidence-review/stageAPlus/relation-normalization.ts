import { validateClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import {
  reviewNoteForKnowledge,
  STAGE_A_PLUS_CONFIDENCE,
  type StageAPlusCompiledKnowledge,
  type StageAPlusRelationClaimRow,
  type StageAPlusRecallOutput
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

function labelsEqual(left: string, right: string): boolean {
  return left.trim() === right.trim();
}

function appliesNegativeDirection(
  relation: StageAPlusRelationClaimRow,
  denyDirection: StageAPlusRelationClaimRow["direction"] | null
): boolean {
  return denyDirection === null || denyDirection === relation.direction;
}

function relationConfidence(baseConfidence: number, ruleConfidence: number): number {
  return Math.min(
    1,
    Math.max(ruleConfidence, baseConfidence + STAGE_A_PLUS_CONFIDENCE.RELATION_BOOST)
  );
}

export function normalizeStageAPlusRelations(input: {
  bookId   : string;
  chapterId: string;
  runId    : string;
  relations: StageAPlusRelationClaimRow[];
  knowledge: StageAPlusCompiledKnowledge;
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
    const negativeRule = input.knowledge.relationNegativeRules.find(
      (rule) =>
        rule.blockedLabels.some((label) => labelsEqual(label, relation.relationLabel))
        && appliesNegativeDirection(relation, rule.denyDirection)
    );

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

    const mapping = input.knowledge.relationMappings.find((rule) =>
      labelsEqual(rule.observedLabel, relation.relationLabel)
    );
    const taxonomy = mapping
      ? null
      : input.knowledge.relationTaxonomyRules.find(
        (rule) =>
          labelsEqual(rule.displayLabel, relation.relationLabel)
          || rule.aliasLabels.some((label) => labelsEqual(label, relation.relationLabel))
      );

    const rule = mapping ?? taxonomy;
    if (!rule) {
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
        reviewNote      : rule.reviewState === "PENDING"
          ? reviewNoteForKnowledge(
            "KB_PENDING_HINT",
            rule.id,
            `relationLabel=${relation.relationLabel}; relationTypeKey=${rule.relationTypeKey}`
          )
          : reviewNoteForKnowledge(
            "KB_VERIFIED",
            rule.id,
            `relationLabel=${relation.relationLabel}; relationTypeKey=${rule.relationTypeKey}`
          ),
        supersedesClaimId : null,
        derivedFromClaimId: relation.id,
        evidenceSpanIds   : relation.evidenceSpanIds,
        confidence        : rule.reviewState === "PENDING"
          ? rule.confidence
          : relationConfidence(relation.confidence, rule.confidence),
        sourceMentionId         : relation.sourceMentionId,
        targetMentionId         : relation.targetMentionId,
        sourcePersonaCandidateId: relation.sourcePersonaCandidateId,
        targetPersonaCandidateId: relation.targetPersonaCandidateId,
        relationTypeKey         : rule.relationTypeKey,
        relationLabel           : relation.relationLabel,
        relationTypeSource      : rule.relationTypeSource === "PRESET"
          ? "PRESET"
          : "NORMALIZED_FROM_CUSTOM",
        direction            : relation.direction,
        effectiveChapterStart: relation.effectiveChapterStart,
        effectiveChapterEnd  : relation.effectiveChapterEnd,
        timeHintId           : relation.timeHintId
      })
    );
    recordKnowledgeId(rule.id);
  }

  return {
    relationDrafts,
    discardRecords: [],
    knowledgeItemIds
  };
}
