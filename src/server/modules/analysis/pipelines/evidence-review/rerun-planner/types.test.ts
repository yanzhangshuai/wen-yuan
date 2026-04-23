import { describe, expect, it } from "vitest";

import type {
  EvidenceReviewRerunChange,
  EvidenceReviewRerunPlan
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/types";
import {
  EVIDENCE_REVIEW_KB_CHANGE_KIND_VALUES,
  EVIDENCE_REVIEW_RELATION_CATALOG_IMPACT_MODE_VALUES,
  EVIDENCE_REVIEW_RERUN_CHANGE_KIND_VALUES,
  EVIDENCE_REVIEW_RERUN_EXECUTION_MODE_VALUES,
  EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES,
  EVIDENCE_REVIEW_RERUN_STAGE_PLAN_SCOPE_KIND_VALUES
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/types";

describe("evidence review rerun planner type contracts", () => {
  it("keeps the stable rerun stage universe", () => {
    expect(EVIDENCE_REVIEW_RERUN_STAGE_KEY_VALUES).toEqual([
      "STAGE_0",
      "STAGE_A",
      "STAGE_A_PLUS",
      "STAGE_B",
      "STAGE_B5",
      "STAGE_C",
      "STAGE_D"
    ]);
  });

  it("locks the supported change and policy discriminants", () => {
    expect(EVIDENCE_REVIEW_RERUN_CHANGE_KIND_VALUES).toEqual([
      "REVIEW_MUTATION",
      "CHAPTER_TEXT_CHANGE",
      "KNOWLEDGE_BASE_CHANGE",
      "RELATION_CATALOG_CHANGE"
    ]);
    expect(EVIDENCE_REVIEW_KB_CHANGE_KIND_VALUES).toEqual([
      "ALIAS_RULE",
      "PERSONA_HINT",
      "RELATION_NORMALIZATION",
      "BAN_MERGE_HINT"
    ]);
    expect(EVIDENCE_REVIEW_RELATION_CATALOG_IMPACT_MODE_VALUES).toEqual([
      "DISPLAY_ONLY",
      "NORMALIZATION_RULE"
    ]);
    expect(EVIDENCE_REVIEW_RERUN_EXECUTION_MODE_VALUES).toEqual([
      "PROJECTION_ONLY",
      "PIPELINE_RERUN"
    ]);
    expect(EVIDENCE_REVIEW_RERUN_STAGE_PLAN_SCOPE_KIND_VALUES).toEqual([
      "LOCAL_CHAPTER",
      "FULL_BOOK",
      "PROJECTION_REBUILD"
    ]);
  });

  it("uses an explicit discriminated union for rerun changes", () => {
    const changes = [
      {
        changeKind      : "REVIEW_MUTATION",
        bookId          : "book-1",
        reason          : "manual relation approval",
        claimFamilies   : ["RELATION"],
        projectionScopes: [
          {
            kind              : "PROJECTION_ONLY",
            bookId            : "book-1",
            projectionFamilies: ["relationship_edges"]
          }
        ]
      },
      {
        changeKind   : "CHAPTER_TEXT_CHANGE",
        bookId       : "book-1",
        reason       : "chapter text corrected",
        previousRunId: "run-1",
        chapterIds   : ["chapter-1"],
        segmentIds   : ["segment-1"]
      },
      {
        changeKind      : "KNOWLEDGE_BASE_CHANGE",
        bookId          : "book-1",
        reason          : "alias rule updated",
        previousRunId   : "run-1",
        kbChangeKinds   : ["ALIAS_RULE"],
        affectedEntryIds: ["kb-entry-1"]
      },
      {
        changeKind      : "RELATION_CATALOG_CHANGE",
        bookId          : "book-1",
        reason          : "relation catalog labels refreshed",
        previousRunId   : "run-1",
        relationTypeKeys: ["kinship"],
        impactMode      : "DISPLAY_ONLY"
      }
    ] satisfies EvidenceReviewRerunChange[];

    function readPayload(change: EvidenceReviewRerunChange): readonly string[] {
      switch (change.changeKind) {
        case "REVIEW_MUTATION":
          return change.projectionScopes.map((scope) => scope.kind);
        case "CHAPTER_TEXT_CHANGE":
          return change.chapterIds;
        case "KNOWLEDGE_BASE_CHANGE":
          return change.kbChangeKinds;
        case "RELATION_CATALOG_CHANGE":
          return change.relationTypeKeys;
      }
    }

    expect(changes.map((change) => change.changeKind)).toEqual(
      EVIDENCE_REVIEW_RERUN_CHANGE_KIND_VALUES
    );
    expect(changes.map(readPayload)).toEqual([
      ["PROJECTION_ONLY"],
      ["chapter-1"],
      ["ALIAS_RULE"],
      ["kinship"]
    ]);
  });

  it("keeps the rerun plan DTO split between execution mode and projection scopes", () => {
    const plan: EvidenceReviewRerunPlan = {
      bookId        : "book-1",
      changeKind    : "REVIEW_MUTATION",
      executionMode : "PROJECTION_ONLY",
      reason        : "manual relation approval",
      expectedStages: ["STAGE_D"],
      affectedRange : {
        runIds             : ["run-1"],
        chapterIds         : ["chapter-1"],
        chapterNos         : [1],
        segmentIds         : ["segment-1"],
        claimFamilies      : ["RELATION"],
        personaCandidateIds: [],
        projectionScopes   : [
          {
            kind              : "PROJECTION_ONLY",
            bookId            : "book-1",
            projectionFamilies: ["relationship_edges"]
          }
        ],
        projectionFamilies: ["relationship_edges"]
      },
      stagePlans: [
        {
          stageKey               : "STAGE_D",
          scopeKind              : "PROJECTION_REBUILD",
          chapterIds             : [],
          preservePreviousOutputs: true
        }
      ],
      cache: {
        invalidateStageKeys          : ["STAGE_D"],
        preserveStageKeys            : [],
        invalidatedProjectionFamilies: ["relationship_edges"],
        comparableBaselineRunId      : "run-1"
      },
      explanation: {
        summary: "Projection-only rebuild",
        lines  : ["Manual review changed only the final projection."]
      }
    };

    expect(plan.stagePlans[0]?.scopeKind).toBe("PROJECTION_REBUILD");
    expect(plan.affectedRange.projectionScopes[0]?.kind).toBe("PROJECTION_ONLY");
  });
});
