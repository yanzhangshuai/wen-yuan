import { describe, expect, it, vi } from "vitest";

import { createEvidenceReviewRerunPlanner } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/planner";

function createRepositoryMock() {
  return {
    listChapterMetadata          : vi.fn(),
    findLatestSuccessfulRun      : vi.fn(),
    listLatestSuccessfulStageRuns: vi.fn()
  };
}

describe("evidence review rerun planner", () => {
  it("plans projection-only local rebuilds for review mutations", async () => {
    const repository = createRepositoryMock();
    const planner = createEvidenceReviewRerunPlanner({ repository: repository as never });

    const plan = await planner.planChange({
      changeKind      : "REVIEW_MUTATION",
      bookId          : "book-1",
      reason          : "manual relation approval",
      runId           : "run-7",
      claimFamilies   : ["RELATION"],
      projectionScopes: [
        {
          kind              : "RELATION_EDGE",
          bookId            : "book-1",
          sourcePersonaId   : "persona-1",
          targetPersonaId   : "persona-2",
          relationTypeKey   : "kinship",
          projectionFamilies: ["relationship_edges"]
        }
      ]
    });

    expect(repository.listChapterMetadata).not.toHaveBeenCalled();
    expect(repository.findLatestSuccessfulRun).not.toHaveBeenCalled();
    expect(plan).toEqual({
      bookId        : "book-1",
      changeKind    : "REVIEW_MUTATION",
      executionMode : "PROJECTION_ONLY",
      reason        : "manual relation approval",
      expectedStages: ["STAGE_D"],
      affectedRange : {
        runIds             : ["run-7"],
        chapterIds         : [],
        chapterNos         : [],
        segmentIds         : [],
        claimFamilies      : ["RELATION"],
        personaCandidateIds: [],
        projectionScopes   : [
          {
            kind              : "RELATION_EDGE",
            bookId            : "book-1",
            sourcePersonaId   : "persona-1",
            targetPersonaId   : "persona-2",
            relationTypeKey   : "kinship",
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
        preserveStageKeys            : ["STAGE_0", "STAGE_A", "STAGE_A_PLUS", "STAGE_B", "STAGE_B5", "STAGE_C"],
        invalidatedProjectionFamilies: ["relationship_edges"],
        comparableBaselineRunId      : "run-7"
      },
      explanation: {
        summary: "Projection-only rebuild for manual review mutation.",
        lines  : [
          "Manual review changed only local review projections.",
          "Upstream Stage 0 to Stage C outputs stay reusable."
        ]
      }
    });
  });

  it("plans local chapter extraction with whole-book follow-up for chapter text changes", async () => {
    const repository = createRepositoryMock();
    repository.listChapterMetadata.mockResolvedValue([
      { chapterId: "chapter-5", chapterNo: 5 },
      { chapterId: "chapter-3", chapterNo: 3 }
    ]);
    const planner = createEvidenceReviewRerunPlanner({ repository: repository as never });

    const plan = await planner.planChange({
      changeKind   : "CHAPTER_TEXT_CHANGE",
      bookId       : "book-1",
      reason       : "chapter text corrected",
      previousRunId: "run-11",
      chapterIds   : ["chapter-5", "chapter-3"],
      segmentIds   : ["segment-9"]
    });

    expect(repository.listChapterMetadata).toHaveBeenCalledWith(["chapter-3", "chapter-5"]);
    expect(repository.findLatestSuccessfulRun).not.toHaveBeenCalled();
    expect(plan).toEqual({
      bookId        : "book-1",
      changeKind    : "CHAPTER_TEXT_CHANGE",
      executionMode : "PIPELINE_RERUN",
      reason        : "chapter text corrected",
      expectedStages: [
        "STAGE_0",
        "STAGE_A",
        "STAGE_A_PLUS",
        "STAGE_B",
        "STAGE_B5",
        "STAGE_C",
        "STAGE_D"
      ],
      affectedRange: {
        runIds             : ["run-11"],
        chapterIds         : ["chapter-3", "chapter-5"],
        chapterNos         : [3, 5],
        segmentIds         : ["segment-9"],
        claimFamilies      : [],
        personaCandidateIds: [],
        projectionScopes   : [],
        projectionFamilies : []
      },
      stagePlans: [
        {
          stageKey               : "STAGE_0",
          scopeKind              : "LOCAL_CHAPTER",
          chapterIds             : ["chapter-3", "chapter-5"],
          preservePreviousOutputs: false
        },
        {
          stageKey               : "STAGE_A",
          scopeKind              : "LOCAL_CHAPTER",
          chapterIds             : ["chapter-3", "chapter-5"],
          preservePreviousOutputs: false
        },
        {
          stageKey               : "STAGE_A_PLUS",
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
          stageKey               : "STAGE_B5",
          scopeKind              : "FULL_BOOK",
          chapterIds             : [],
          preservePreviousOutputs: true
        },
        {
          stageKey               : "STAGE_C",
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
      ],
      cache: {
        invalidateStageKeys: [
          "STAGE_0",
          "STAGE_A",
          "STAGE_A_PLUS",
          "STAGE_B",
          "STAGE_B5",
          "STAGE_C",
          "STAGE_D"
        ],
        preserveStageKeys            : [],
        invalidatedProjectionFamilies: [
          "persona_chapter_facts",
          "persona_time_facts",
          "relationship_edges",
          "timeline_events"
        ],
        comparableBaselineRunId: "run-11"
      },
      explanation: {
        summary: "Chapter text change requires local re-extraction and whole-book resolution.",
        lines  : [
          "Affected chapters: #3, #5.",
          "Local Stage 0 to Stage A+ reruns refresh changed text, then Stage B to Stage D rebuild whole-book consistency."
        ]
      }
    });
  });

  it("starts knowledge-base changes at stage a plus without backtracking into stage 0", async () => {
    const repository = createRepositoryMock();
    const planner = createEvidenceReviewRerunPlanner({ repository: repository as never });

    const plan = await planner.planChange({
      changeKind      : "KNOWLEDGE_BASE_CHANGE",
      bookId          : "book-1",
      reason          : "alias rule updated",
      previousRunId   : "run-15",
      kbChangeKinds   : ["ALIAS_RULE", "RELATION_NORMALIZATION"],
      affectedEntryIds: ["kb-1", "kb-2"]
    });

    expect(plan.expectedStages).toEqual([
      "STAGE_A_PLUS",
      "STAGE_B",
      "STAGE_B5",
      "STAGE_C",
      "STAGE_D"
    ]);
    expect(plan.stagePlans).toEqual([
      {
        stageKey               : "STAGE_A_PLUS",
        scopeKind              : "FULL_BOOK",
        chapterIds             : [],
        preservePreviousOutputs: true
      },
      {
        stageKey               : "STAGE_B",
        scopeKind              : "FULL_BOOK",
        chapterIds             : [],
        preservePreviousOutputs: true
      },
      {
        stageKey               : "STAGE_B5",
        scopeKind              : "FULL_BOOK",
        chapterIds             : [],
        preservePreviousOutputs: true
      },
      {
        stageKey               : "STAGE_C",
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
    ]);
    expect(plan.cache).toEqual({
      invalidateStageKeys          : ["STAGE_A_PLUS", "STAGE_B", "STAGE_B5", "STAGE_C", "STAGE_D"],
      preserveStageKeys            : ["STAGE_0", "STAGE_A"],
      invalidatedProjectionFamilies: [
        "persona_chapter_facts",
        "persona_time_facts",
        "relationship_edges",
        "timeline_events"
      ],
      comparableBaselineRunId: "run-15"
    });
    expect(plan.explanation).toEqual({
      summary: "Knowledge-base change requires downstream resolution reruns.",
      lines  : [
        "Knowledge recall inputs changed even though raw chapter text stayed the same.",
        "Stage A+ and downstream resolution stages must be recalculated for consistency."
      ]
    });
  });

  it("keeps display-only relation catalog changes as projection-only relationship edge rebuilds", async () => {
    const repository = createRepositoryMock();
    const planner = createEvidenceReviewRerunPlanner({ repository: repository as never });

    const plan = await planner.planChange({
      changeKind      : "RELATION_CATALOG_CHANGE",
      bookId          : "book-1",
      reason          : "display labels refreshed",
      previousRunId   : "run-16",
      relationTypeKeys: ["kinship"],
      impactMode      : "DISPLAY_ONLY"
    });

    expect(plan).toEqual({
      bookId        : "book-1",
      changeKind    : "RELATION_CATALOG_CHANGE",
      executionMode : "PROJECTION_ONLY",
      reason        : "display labels refreshed",
      expectedStages: ["STAGE_D"],
      affectedRange : {
        runIds             : ["run-16"],
        chapterIds         : [],
        chapterNos         : [],
        segmentIds         : [],
        claimFamilies      : [],
        personaCandidateIds: [],
        projectionScopes   : [],
        projectionFamilies : ["relationship_edges"]
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
        preserveStageKeys            : ["STAGE_0", "STAGE_A", "STAGE_A_PLUS", "STAGE_B", "STAGE_B5", "STAGE_C"],
        invalidatedProjectionFamilies: ["relationship_edges"],
        comparableBaselineRunId      : "run-16"
      },
      explanation: {
        summary: "Relation catalog display change needs only projection refresh.",
        lines  : [
          "Display-only relation metadata changed without touching upstream claims.",
          "Only relationship-edge projections need rebuilding."
        ]
      }
    });
  });

  it("reruns from stage a plus when relation normalization rules change", async () => {
    const repository = createRepositoryMock();
    const planner = createEvidenceReviewRerunPlanner({ repository: repository as never });

    const plan = await planner.planChange({
      changeKind      : "RELATION_CATALOG_CHANGE",
      bookId          : "book-1",
      reason          : "relation normalization updated",
      previousRunId   : "run-17",
      relationTypeKeys: ["kinship", "faction"],
      impactMode      : "NORMALIZATION_RULE"
    });

    expect(plan.expectedStages).toEqual([
      "STAGE_A_PLUS",
      "STAGE_B",
      "STAGE_B5",
      "STAGE_C",
      "STAGE_D"
    ]);
    expect(plan.cache.preserveStageKeys).toEqual(["STAGE_0", "STAGE_A"]);
    expect(plan.cache.invalidatedProjectionFamilies).toEqual([
      "persona_chapter_facts",
      "persona_time_facts",
      "relationship_edges"
    ]);
    expect(plan.explanation).toEqual({
      summary: "Relation catalog normalization change requires downstream reruns.",
      lines  : [
        "Affected relation types: kinship, faction.",
        "Normalization rules changed, so Stage A+ and downstream resolution stages must rerun."
      ]
    });
  });
});
