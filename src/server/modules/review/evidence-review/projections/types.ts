import type {
  ClaimReviewState,
  ClaimSource,
  RelationDirection,
  RelationTypeSource
} from "@/server/modules/review/evidence-review/review-state";
import type { NarrativeLens } from "@/generated/prisma/enums";

export const PROJECTION_FAMILY_VALUES = Object.freeze([
  "persona_chapter_facts",
  "persona_time_facts",
  "relationship_edges",
  "timeline_events"
] as const);

export type ProjectionFamily = (typeof PROJECTION_FAMILY_VALUES)[number];

export type ProjectionRebuildScope =
  | { kind: "FULL_BOOK"; bookId: string; projectionFamilies?: readonly ProjectionFamily[] }
  | {
      kind               : "CHAPTER";
      bookId             : string;
      chapterId          : string;
      chapterNo?         : number;
      projectionFamilies?: readonly ProjectionFamily[];
    }
  | { kind: "PERSONA"; bookId: string; personaId: string; projectionFamilies?: readonly ProjectionFamily[] }
  | {
      kind               : "TIME_SLICE";
      bookId             : string;
      timeLabel          : string;
      projectionFamilies?: readonly ProjectionFamily[];
    }
  | {
      kind               : "RELATION_EDGE";
      bookId             : string;
      sourcePersonaId    : string;
      targetPersonaId    : string;
      relationTypeKey?   : string;
      projectionFamilies?: readonly ProjectionFamily[];
    }
  | { kind: "PROJECTION_ONLY"; bookId: string; projectionFamilies: readonly ProjectionFamily[] };

export type IdentityResolutionClaimProjectionSourceRow = {
  id                : string;
  bookId            : string;
  chapterId         : string | null;
  mentionId         : string;
  personaCandidateId: string | null;
  resolvedPersonaId : string | null;
  resolutionKind    : string;
  reviewState       : ClaimReviewState;
  source            : ClaimSource;
  runId             : string;
  createdAt         : Date;
  updatedAt         : Date;
};

export type EventClaimProjectionSourceRow = {
  id                       : string;
  bookId                   : string;
  chapterId                : string;
  subjectPersonaCandidateId: string | null;
  objectPersonaCandidateId : string | null;
  predicate                : string;
  objectText               : string | null;
  locationText             : string | null;
  timeHintId               : string | null;
  eventCategory            : string;
  narrativeLens            : NarrativeLens;
  evidenceSpanIds          : readonly string[];
  confidence               : number;
  reviewState              : ClaimReviewState;
  source                   : ClaimSource;
  runId                    : string;
  createdAt                : Date;
  updatedAt                : Date;
};

export type RelationClaimProjectionSourceRow = {
  id                      : string;
  bookId                  : string;
  chapterId               : string;
  sourcePersonaCandidateId: string | null;
  targetPersonaCandidateId: string | null;
  relationTypeKey         : string;
  relationLabel           : string;
  relationTypeSource      : RelationTypeSource;
  direction               : RelationDirection;
  effectiveChapterStart   : number | null;
  effectiveChapterEnd     : number | null;
  timeHintId              : string | null;
  evidenceSpanIds         : readonly string[];
  confidence              : number;
  reviewState             : ClaimReviewState;
  source                  : ClaimSource;
  runId                   : string;
  createdAt               : Date;
  updatedAt               : Date;
};

export type TimeClaimProjectionSourceRow = {
  id                 : string;
  bookId             : string;
  chapterId          : string;
  rawTimeText        : string;
  timeType           : string;
  normalizedLabel    : string;
  relativeOrderWeight: number | null;
  chapterRangeStart  : number | null;
  chapterRangeEnd    : number | null;
  evidenceSpanIds    : readonly string[];
  confidence         : number;
  reviewState        : ClaimReviewState;
  source             : ClaimSource;
  runId              : string;
  createdAt          : Date;
  updatedAt          : Date;
};

export type ConflictFlagProjectionSourceRow = {
  id                        : string;
  bookId                    : string;
  chapterId                 : string | null;
  runId                     : string;
  conflictType              : string;
  severity                  : string;
  reason                    : string;
  recommendedActionKey      : string;
  sourceStageKey            : string;
  relatedClaimKind          : string | null;
  relatedClaimIds           : readonly string[];
  relatedPersonaCandidateIds: readonly string[];
  relatedChapterIds         : readonly string[];
  summary                   : string;
  evidenceSpanIds           : readonly string[];
  reviewState               : ClaimReviewState;
  source                    : ClaimSource;
  reviewedByUserId          : string | null;
  reviewedAt                : Date | null;
  reviewNote                : string | null;
  createdAt                 : Date;
  updatedAt                 : Date;
};

export type ProjectionChapterSourceRow = {
  id    : string;
  bookId: string;
  no    : number;
};

export const PERSONA_CHAPTER_REVIEW_STATE_FAMILY_VALUES = Object.freeze([
  "EVENT",
  "RELATION",
  "CONFLICT"
] as const);

export type PersonaChapterReviewStateFamily =
  (typeof PERSONA_CHAPTER_REVIEW_STATE_FAMILY_VALUES)[number];

export type PersonaChapterReviewStateSummary = Partial<
  Record<PersonaChapterReviewStateFamily, Partial<Record<ClaimReviewState, number>>>
>;

export type PersonaChapterFactProjectionRow = {
  bookId            : string;
  personaId         : string;
  chapterId         : string;
  chapterNo         : number;
  eventCount        : number;
  relationCount     : number;
  conflictCount     : number;
  reviewStateSummary: PersonaChapterReviewStateSummary;
  latestUpdatedAt   : Date;
};

export type BuildPersonaChapterFactsInput = {
  chapters              : readonly ProjectionChapterSourceRow[];
  personaIdByCandidateId: ReadonlyMap<string, string>;
  eventClaims           : readonly EventClaimProjectionSourceRow[];
  relationClaims        : readonly RelationClaimProjectionSourceRow[];
  conflictFlags         : readonly ConflictFlagProjectionSourceRow[];
};

export type PersonaTimeFactProjectionRow = {
  bookId            : string;
  personaId         : string;
  timeLabel         : string;
  timeSortKey       : number | null;
  chapterRangeStart : number | null;
  chapterRangeEnd   : number | null;
  eventCount        : number;
  relationCount     : number;
  sourceTimeClaimIds: readonly string[];
};

export type BuildPersonaTimeFactsInput = {
  personaIdByCandidateId: ReadonlyMap<string, string>;
  eventClaims           : readonly EventClaimProjectionSourceRow[];
  relationClaims        : readonly RelationClaimProjectionSourceRow[];
  timeClaims            : readonly TimeClaimProjectionSourceRow[];
};

export type RelationshipEdgeProjectionRow = {
  bookId               : string;
  sourcePersonaId      : string;
  targetPersonaId      : string;
  relationTypeKey      : string;
  relationLabel        : string;
  relationTypeSource   : RelationTypeSource;
  direction            : RelationDirection;
  effectiveChapterStart: number | null;
  effectiveChapterEnd  : number | null;
  sourceClaimIds       : readonly string[];
  latestClaimId        : string | null;
};

export type RelationshipEdgeSelection = {
  sourcePersonaId : string;
  targetPersonaId : string;
  relationTypeKey?: string;
};

export type BuildRelationshipEdgesInput = {
  personaIdByCandidateId: ReadonlyMap<string, string>;
  relationClaims        : readonly RelationClaimProjectionSourceRow[];
  selection?            : RelationshipEdgeSelection;
};

export type TimelineEventProjectionRow = {
  bookId        : string;
  personaId     : string;
  chapterId     : string | null;
  chapterNo     : number | null;
  timeLabel     : string | null;
  eventLabel    : string;
  narrativeLens : NarrativeLens;
  sourceClaimIds: readonly string[];
};

export type BuildTimelineEventsInput = {
  personaIdByCandidateId: ReadonlyMap<string, string>;
  eventClaims           : readonly EventClaimProjectionSourceRow[];
  timeClaims            : readonly TimeClaimProjectionSourceRow[];
};

export type ProjectionRowsByFamily = {
  persona_chapter_facts: readonly PersonaChapterFactProjectionRow[];
  persona_time_facts   : readonly PersonaTimeFactProjectionRow[];
  relationship_edges   : readonly RelationshipEdgeProjectionRow[];
  timeline_events      : readonly TimelineEventProjectionRow[];
};

export type ProjectionPersistenceCounts = {
  deleted: number;
  created: number;
};

export type ProjectionBuildResult = {
  counts         : ProjectionPersistenceCounts;
  rebuiltFamilies: readonly ProjectionFamily[];
  skipped: {
    unmappedPersonaCandidateIds : readonly string[];
    ambiguousPersonaCandidateIds: readonly string[];
  };
};

export type ProjectionSourcePayload = {
  identityResolutionClaims: readonly IdentityResolutionClaimProjectionSourceRow[];
  eventClaims             : readonly EventClaimProjectionSourceRow[];
  relationClaims          : readonly RelationClaimProjectionSourceRow[];
  timeClaims              : readonly TimeClaimProjectionSourceRow[];
  conflictFlags           : readonly ConflictFlagProjectionSourceRow[];
  chapters                : readonly ProjectionChapterSourceRow[];
};

export type ProjectionRepository = {
  transaction<T>(callback: (txRepository: ProjectionRepository) => Promise<T>): Promise<T>;
  loadProjectionSource(scope: ProjectionRebuildScope): Promise<ProjectionSourcePayload>;
  replaceProjectionRows(
    scope: ProjectionRebuildScope,
    rows: ProjectionRowsByFamily
  ): Promise<ProjectionPersistenceCounts>;
};

export type ProjectionBuilder = {
  rebuildProjection(scope: ProjectionRebuildScope): Promise<ProjectionBuildResult>;
};

export type BuildAcceptedPersonaMappingInput = {
  identityResolutionClaims    : readonly IdentityResolutionClaimProjectionSourceRow[];
  requiredPersonaCandidateIds?: readonly string[];
};

export type AcceptedPersonaMapping = {
  personaIdByCandidateId: ReadonlyMap<string, string>;
  unmappedCandidateIds  : readonly string[];
  ambiguousCandidateIds : readonly string[];
};
