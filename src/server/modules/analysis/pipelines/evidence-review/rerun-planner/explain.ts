import type {
  EvidenceReviewAffectedRange,
  EvidenceReviewRerunChange,
  EvidenceReviewRerunExecutionMode,
  EvidenceReviewRerunExplanation,
  EvidenceReviewStagePlan
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/types";

export interface BuildEvidenceReviewRerunExplanationInput {
  change       : EvidenceReviewRerunChange;
  executionMode: EvidenceReviewRerunExecutionMode;
  affectedRange: Pick<EvidenceReviewAffectedRange, "chapterNos" | "projectionFamilies">;
  stagePlans   : EvidenceReviewStagePlan[];
}

export function buildEvidenceReviewRerunExplanation(
  input: BuildEvidenceReviewRerunExplanationInput
): EvidenceReviewRerunExplanation {
  switch (input.change.changeKind) {
    case "REVIEW_MUTATION":
      return {
        summary: "Projection-only rebuild for manual review mutation.",
        lines  : [
          "Manual review changed only local review projections.",
          "Upstream Stage 0 to Stage C outputs stay reusable."
        ]
      };

    case "CHAPTER_TEXT_CHANGE": {
      const chapterLabels = input.affectedRange.chapterNos.map((chapterNo) => `#${chapterNo}`).join(", ");

      return {
        summary: "Chapter text change requires local re-extraction and whole-book resolution.",
        lines  : [
          `Affected chapters: ${chapterLabels}.`,
          "Local Stage 0 to Stage A+ reruns refresh changed text, then Stage B to Stage D rebuild whole-book consistency."
        ]
      };
    }

    case "KNOWLEDGE_BASE_CHANGE":
      return {
        summary: "Knowledge-base change requires downstream resolution reruns.",
        lines  : [
          "Knowledge recall inputs changed even though raw chapter text stayed the same.",
          "Stage A+ and downstream resolution stages must be recalculated for consistency."
        ]
      };

    case "RELATION_CATALOG_CHANGE":
      if (input.change.impactMode === "DISPLAY_ONLY") {
        return {
          summary: "Relation catalog display change needs only projection refresh.",
          lines  : [
            "Display-only relation metadata changed without touching upstream claims.",
            "Only relationship-edge projections need rebuilding."
          ]
        };
      }

      return {
        summary: "Relation catalog normalization change requires downstream reruns.",
        lines  : [
          `Affected relation types: ${input.change.relationTypeKeys.join(", ")}.`,
          "Normalization rules changed, so Stage A+ and downstream resolution stages must rerun."
        ]
      };
  }
}
