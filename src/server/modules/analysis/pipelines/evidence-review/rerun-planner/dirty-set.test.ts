import { describe, expect, it } from "vitest";

import { buildEvidenceReviewDirtySet } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/dirty-set";

describe("evidence review dirty-set builder", () => {
  it("preserves local projection scopes for review mutations and normalizes arrays", () => {
    const dirtySet = buildEvidenceReviewDirtySet({
      changeKind        : "REVIEW_MUTATION",
      bookId            : "book-1",
      reason            : "manual relation approval",
      runId             : "run-9",
      claimFamilies     : ["RELATION", "EVENT", "RELATION"],
      projectionFamilies: ["timeline_events", "relationship_edges"],
      projectionScopes  : [
        {
          kind              : "RELATION_EDGE",
          bookId            : "book-1",
          sourcePersonaId   : "persona-2",
          targetPersonaId   : "persona-1",
          relationTypeKey   : "kinship",
          projectionFamilies: ["relationship_edges"]
        },
        {
          kind              : "PROJECTION_ONLY",
          bookId            : "book-1",
          projectionFamilies: ["persona_time_facts", "timeline_events"]
        }
      ]
    });

    expect(dirtySet).toEqual({
      bookId             : "book-1",
      runIds             : ["run-9"],
      chapterIds         : [],
      segmentIds         : [],
      claimFamilies      : ["EVENT", "RELATION"],
      personaCandidateIds: [],
      projectionSlices   : [
        {
          kind              : "RELATION_EDGE",
          bookId            : "book-1",
          sourcePersonaId   : "persona-2",
          targetPersonaId   : "persona-1",
          relationTypeKey   : "kinship",
          projectionFamilies: ["relationship_edges"]
        },
        {
          kind              : "PROJECTION_ONLY",
          bookId            : "book-1",
          projectionFamilies: ["persona_time_facts", "timeline_events"]
        }
      ],
      projectionFamilies: [
        "persona_time_facts",
        "relationship_edges",
        "timeline_events"
      ]
    });
  });

  it("deduplicates and stable-sorts chapter and segment ids for chapter text changes", () => {
    const dirtySet = buildEvidenceReviewDirtySet({
      changeKind   : "CHAPTER_TEXT_CHANGE",
      bookId       : "book-1",
      reason       : "chapter text corrected",
      previousRunId: "run-4",
      chapterIds   : ["chapter-2", "chapter-1", "chapter-2"],
      segmentIds   : ["segment-3", "segment-1", "segment-3"]
    });

    expect(dirtySet).toEqual({
      bookId             : "book-1",
      runIds             : ["run-4"],
      chapterIds         : ["chapter-1", "chapter-2"],
      segmentIds         : ["segment-1", "segment-3"],
      claimFamilies      : [],
      personaCandidateIds: [],
      projectionSlices   : [],
      projectionFamilies : []
    });
  });

  it("records display-only relation catalog changes as relationship-edge projection refreshes only", () => {
    const dirtySet = buildEvidenceReviewDirtySet({
      changeKind      : "RELATION_CATALOG_CHANGE",
      bookId          : "book-1",
      reason          : "display labels refreshed",
      previousRunId   : "run-5",
      relationTypeKeys: ["kinship"],
      impactMode      : "DISPLAY_ONLY"
    });

    expect(dirtySet).toEqual({
      bookId             : "book-1",
      runIds             : ["run-5"],
      chapterIds         : [],
      segmentIds         : [],
      claimFamilies      : [],
      personaCandidateIds: [],
      projectionSlices   : [],
      projectionFamilies : ["relationship_edges"]
    });
  });

  it("does not invent persona candidates or segments for knowledge-base changes", () => {
    const dirtySet = buildEvidenceReviewDirtySet({
      changeKind      : "KNOWLEDGE_BASE_CHANGE",
      bookId          : "book-1",
      reason          : "alias rule updated",
      previousRunId   : "run-7",
      kbChangeKinds   : ["ALIAS_RULE", "BAN_MERGE_HINT"],
      affectedEntryIds: ["entry-2", "entry-1"]
    });

    expect(dirtySet).toEqual({
      bookId             : "book-1",
      runIds             : ["run-7"],
      chapterIds         : [],
      segmentIds         : [],
      claimFamilies      : [],
      personaCandidateIds: [],
      projectionSlices   : [],
      projectionFamilies : []
    });
  });
});
