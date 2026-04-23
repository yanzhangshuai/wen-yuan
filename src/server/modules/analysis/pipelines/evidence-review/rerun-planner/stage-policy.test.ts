import { describe, expect, it } from "vitest";

import { getEvidenceReviewStagePolicy } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/stage-policy";

describe("evidence review rerun stage policy", () => {
  it("maps review mutations to projection-only stage d rebuilds", () => {
    const policy = getEvidenceReviewStagePolicy({
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
    });

    expect(policy).toEqual({
      executionMode     : "PROJECTION_ONLY",
      expectedStages    : ["STAGE_D"],
      projectionFamilies: ["relationship_edges"]
    });
  });

  it("maps chapter text changes to local extraction plus full-book resolution", () => {
    const policy = getEvidenceReviewStagePolicy({
      changeKind   : "CHAPTER_TEXT_CHANGE",
      bookId       : "book-1",
      reason       : "chapter text corrected",
      previousRunId: "run-1",
      chapterIds   : ["chapter-1"]
    });

    expect(policy.executionMode).toBe("PIPELINE_RERUN");
    expect(policy.expectedStages).toEqual([
      "STAGE_0",
      "STAGE_A",
      "STAGE_A_PLUS",
      "STAGE_B",
      "STAGE_B5",
      "STAGE_C",
      "STAGE_D"
    ]);
    expect(policy.projectionFamilies).toEqual([
      "persona_chapter_facts",
      "persona_time_facts",
      "relationship_edges",
      "timeline_events"
    ]);
  });

  it("maps knowledge-base changes to stage a plus and downstream whole-book stages", () => {
    const policy = getEvidenceReviewStagePolicy({
      changeKind      : "KNOWLEDGE_BASE_CHANGE",
      bookId          : "book-1",
      reason          : "alias rule updated",
      previousRunId   : "run-1",
      kbChangeKinds   : ["ALIAS_RULE", "BAN_MERGE_HINT"],
      affectedEntryIds: ["kb-entry-1"]
    });

    expect(policy).toEqual({
      executionMode : "PIPELINE_RERUN",
      expectedStages: [
        "STAGE_A_PLUS",
        "STAGE_B",
        "STAGE_B5",
        "STAGE_C",
        "STAGE_D"
      ],
      projectionFamilies: [
        "persona_chapter_facts",
        "persona_time_facts",
        "relationship_edges",
        "timeline_events"
      ]
    });
  });

  it("treats display-only relation catalog changes as relationship edge projection refreshes", () => {
    const policy = getEvidenceReviewStagePolicy({
      changeKind      : "RELATION_CATALOG_CHANGE",
      bookId          : "book-1",
      reason          : "display labels refreshed",
      previousRunId   : "run-1",
      relationTypeKeys: ["kinship"],
      impactMode      : "DISPLAY_ONLY"
    });

    expect(policy).toEqual({
      executionMode     : "PROJECTION_ONLY",
      expectedStages    : ["STAGE_D"],
      projectionFamilies: ["relationship_edges"]
    });
  });

  it("treats normalization rule relation catalog changes as stage a plus reruns", () => {
    const policy = getEvidenceReviewStagePolicy({
      changeKind      : "RELATION_CATALOG_CHANGE",
      bookId          : "book-1",
      reason          : "normalization rules changed",
      previousRunId   : "run-1",
      relationTypeKeys: ["kinship", "faction"],
      impactMode      : "NORMALIZATION_RULE"
    });

    expect(policy).toEqual({
      executionMode : "PIPELINE_RERUN",
      expectedStages: [
        "STAGE_A_PLUS",
        "STAGE_B",
        "STAGE_B5",
        "STAGE_C",
        "STAGE_D"
      ],
      projectionFamilies: [
        "persona_chapter_facts",
        "persona_time_facts",
        "relationship_edges"
      ]
    });
  });
});
