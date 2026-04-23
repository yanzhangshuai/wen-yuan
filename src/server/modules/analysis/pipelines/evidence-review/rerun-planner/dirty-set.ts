import type { ProjectionFamily } from "@/server/modules/review/evidence-review/projections/types";
import { PROJECTION_FAMILY_VALUES } from "@/server/modules/review/evidence-review/projections/types";

import type {
  EvidenceReviewDirtySet,
  EvidenceReviewRerunChange
} from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/types";

const RELATIONSHIP_EDGES = "relationship_edges" satisfies ProjectionFamily;

export function buildEvidenceReviewDirtySet(
  change: EvidenceReviewRerunChange
): EvidenceReviewDirtySet {
  switch (change.changeKind) {
    case "REVIEW_MUTATION":
      return {
        bookId             : change.bookId,
        runIds             : compactIds(change.runId),
        chapterIds         : [],
        segmentIds         : [],
        claimFamilies      : normalizeStringArray(change.claimFamilies),
        personaCandidateIds: [],
        projectionSlices   : [...change.projectionScopes],
        projectionFamilies : normalizeProjectionFamilies([
          ...(change.projectionFamilies ?? []),
          ...change.projectionScopes.flatMap((scope) => scope.projectionFamilies ?? [])
        ])
      };

    case "CHAPTER_TEXT_CHANGE":
      return {
        bookId             : change.bookId,
        runIds             : compactIds(change.previousRunId),
        chapterIds         : normalizeStringArray(change.chapterIds),
        segmentIds         : normalizeStringArray(change.segmentIds),
        claimFamilies      : [],
        personaCandidateIds: [],
        projectionSlices   : [],
        projectionFamilies : []
      };

    case "KNOWLEDGE_BASE_CHANGE":
      return {
        bookId             : change.bookId,
        runIds             : compactIds(change.previousRunId),
        chapterIds         : [],
        segmentIds         : [],
        claimFamilies      : [],
        personaCandidateIds: [],
        projectionSlices   : [],
        projectionFamilies : []
      };

    case "RELATION_CATALOG_CHANGE":
      return {
        bookId             : change.bookId,
        runIds             : compactIds(change.previousRunId),
        chapterIds         : [],
        segmentIds         : [],
        claimFamilies      : [],
        personaCandidateIds: [],
        projectionSlices   : [],
        projectionFamilies : change.impactMode === "DISPLAY_ONLY" ? [RELATIONSHIP_EDGES] : []
      };
  }
}

function compactIds(...values: Array<string | null | undefined>): string[] {
  return values.filter((value): value is string => Boolean(value));
}

function normalizeStringArray(values: readonly string[] | undefined): string[] {
  if (!values || values.length === 0) {
    return [];
  }

  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function normalizeProjectionFamilies(values: readonly ProjectionFamily[]): ProjectionFamily[] {
  const familySet = new Set(values);

  return PROJECTION_FAMILY_VALUES.filter((family) => familySet.has(family));
}
