import { describe, expect, it } from "vitest";

import { buildEvidenceReviewRerunExplanation } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/explain";

describe("evidence review rerun explanation formatter", () => {
  it("summarizes projection-only review mutations", () => {
    const explanation = buildEvidenceReviewRerunExplanation({
      change: {
        changeKind      : "REVIEW_MUTATION",
        bookId          : "book-1",
        reason          : "manual relation approval",
        projectionScopes: [
          {
            kind              : "PROJECTION_ONLY",
            bookId            : "book-1",
            projectionFamilies: ["relationship_edges"]
          }
        ]
      },
      executionMode: "PROJECTION_ONLY",
      affectedRange: {
        chapterNos        : [],
        projectionFamilies: ["relationship_edges"]
      },
      stagePlans: [
        {
          stageKey               : "STAGE_D",
          scopeKind              : "PROJECTION_REBUILD",
          chapterIds             : [],
          preservePreviousOutputs: true
        }
      ]
    });

    expect(explanation).toEqual({
      summary: "Projection-only rebuild for manual review mutation.",
      lines  : [
        "Manual review changed only local review projections.",
        "Upstream Stage 0 to Stage C outputs stay reusable."
      ]
    });
  });

  it("explains why chapter text changes still require whole-book resolution", () => {
    const explanation = buildEvidenceReviewRerunExplanation({
      change: {
        changeKind   : "CHAPTER_TEXT_CHANGE",
        bookId       : "book-1",
        reason       : "chapter text corrected",
        chapterIds   : ["chapter-3", "chapter-5"],
        previousRunId: "run-11"
      },
      executionMode: "PIPELINE_RERUN",
      affectedRange: {
        chapterNos        : [3, 5],
        projectionFamilies: []
      },
      stagePlans: [
        {
          stageKey               : "STAGE_0",
          scopeKind              : "LOCAL_CHAPTER",
          chapterIds             : ["chapter-3", "chapter-5"],
          preservePreviousOutputs: false
        },
        {
          stageKey               : "STAGE_B",
          scopeKind              : "FULL_BOOK",
          chapterIds             : [],
          preservePreviousOutputs: true
        },
        {
          stageKey               : "STAGE_D",
          scopeKind              : "PROJECTION_REBUILD",
          chapterIds             : [],
          preservePreviousOutputs: true
        }
      ]
    });

    expect(explanation).toEqual({
      summary: "Chapter text change requires local re-extraction and whole-book resolution.",
      lines  : [
        "Affected chapters: #3, #5.",
        "Local Stage 0 to Stage A+ reruns refresh changed text, then Stage B to Stage D rebuild whole-book consistency."
      ]
    });
  });
});
