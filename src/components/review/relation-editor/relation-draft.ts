import type {
  RelationDirection,
  RelationTypeSource
} from "@/lib/services/review-matrix";

export const CUSTOM_RELATION_TYPE = "__custom__";

export interface RelationDraftTypeOption {
  relationTypeKey: string;
  label          : string;
  direction      : RelationDirection;
}

export interface ManualRelationDraftState {
  runId                : string;
  evidenceSpanIdsText  : string;
  targetPersonaId      : string;
  relationTypeChoice   : string;
  customRelationTypeKey: string;
  customRelationLabel  : string;
  direction            : RelationDirection;
  effectiveChapterStart: string;
  effectiveChapterEnd  : string;
  timeHintId           : string;
}

export interface RelationEditDraftState {
  chapterId               : string;
  confidence              : string;
  runId                   : string;
  sourceMentionId         : string;
  targetMentionId         : string;
  sourcePersonaCandidateId: string;
  targetPersonaCandidateId: string;
  relationTypeKey         : string;
  relationLabel           : string;
  direction               : RelationDirection;
  effectiveChapterStart   : string;
  effectiveChapterEnd     : string;
  timeHintId              : string;
  evidenceSpanIdsText     : string;
}

type RelationDraftTypeSource = Extract<RelationTypeSource, "PRESET" | "CUSTOM">;

interface BuildManualRelationDraftInput {
  bookId                  : string;
  chapterId               : string;
  sourcePersonaCandidateId: string;
  targetPersonaCandidateId: string;
  draft                   : ManualRelationDraftState;
  relationTypeOptions     : RelationDraftTypeOption[];
}

interface BuildRelationEditPayloadInput {
  draft              : RelationEditDraftState;
  relationTypeOptions: RelationDraftTypeOption[];
  bookId?            : string;
}

/**
 * Accepts the temporary comma/newline text input used by current review forms
 * and normalizes it to the stable string array expected by claim mutations.
 */
export function parseEvidenceSpanIds(value: string): string[] {
  return value
    .split(/[,\n]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

/**
 * Preserves the review mutation contract that blank optional relation fields
 * cross the route boundary as null instead of empty strings.
 */
export function toNullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Reviewer-entered chapter windows come from text fields, so blank or invalid
 * values must safely degrade to null rather than leaking NaN into payloads.
 */
export function toNullableChapterNo(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed.length === 0) {
    return null;
  }

  const numeric = Number(trimmed);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Relation keys stay open strings. The catalog only tells the UI whether the
 * current key originated from a preset suggestion or reviewer custom input.
 */
export function resolveRelationTypeSource(
  relationTypeKey: string,
  relationTypeOptions: RelationDraftTypeOption[]
): RelationDraftTypeSource {
  return relationTypeOptions.some((option) => option.relationTypeKey === relationTypeKey)
    ? "PRESET"
    : "CUSTOM";
}

/**
 * Builds the T12 manual relation draft from either a catalog preset or an open
 * reviewer-entered relation key. Custom keys are deliberately not enum-gated.
 */
export function buildManualRelationDraft(input: BuildManualRelationDraftInput) {
  const preset = input.relationTypeOptions.find((option) =>
    option.relationTypeKey === input.draft.relationTypeChoice
  );
  const isCustom = input.draft.relationTypeChoice === CUSTOM_RELATION_TYPE || preset === undefined;

  return {
    bookId                  : input.bookId,
    chapterId               : input.chapterId,
    confidence              : 1,
    runId                   : input.draft.runId.trim(),
    sourceMentionId         : null,
    targetMentionId         : null,
    sourcePersonaCandidateId: input.sourcePersonaCandidateId,
    targetPersonaCandidateId: input.targetPersonaCandidateId,
    relationTypeKey         : isCustom
      ? input.draft.customRelationTypeKey.trim()
      : preset.relationTypeKey,
    relationLabel: isCustom
      ? input.draft.customRelationLabel.trim()
      : preset.label,
    relationTypeSource   : isCustom ? "CUSTOM" : "PRESET",
    direction            : isCustom ? input.draft.direction : preset.direction,
    effectiveChapterStart: toNullableChapterNo(input.draft.effectiveChapterStart),
    effectiveChapterEnd  : toNullableChapterNo(input.draft.effectiveChapterEnd),
    timeHintId           : toNullableText(input.draft.timeHintId),
    evidenceSpanIds      : parseEvidenceSpanIds(input.draft.evidenceSpanIdsText)
  };
}

/**
 * Builds the relation EDIT draft used by both review surfaces. The default
 * empty bookId preserves the T13 call site pattern that overwrites it at submit.
 */
export function buildRelationEditPayload(input: BuildRelationEditPayloadInput) {
  const relationTypeKey = input.draft.relationTypeKey.trim();

  return {
    bookId                  : input.bookId ?? "",
    chapterId               : input.draft.chapterId,
    confidence              : Number(input.draft.confidence),
    runId                   : input.draft.runId,
    sourceMentionId         : toNullableText(input.draft.sourceMentionId),
    targetMentionId         : toNullableText(input.draft.targetMentionId),
    sourcePersonaCandidateId: toNullableText(input.draft.sourcePersonaCandidateId),
    targetPersonaCandidateId: toNullableText(input.draft.targetPersonaCandidateId),
    relationTypeKey,
    relationLabel           : input.draft.relationLabel.trim(),
    relationTypeSource      : resolveRelationTypeSource(
      relationTypeKey,
      input.relationTypeOptions
    ),
    direction            : input.draft.direction,
    effectiveChapterStart: toNullableChapterNo(input.draft.effectiveChapterStart),
    effectiveChapterEnd  : toNullableChapterNo(input.draft.effectiveChapterEnd),
    timeHintId           : toNullableText(input.draft.timeHintId),
    evidenceSpanIds      : parseEvidenceSpanIds(input.draft.evidenceSpanIdsText)
  };
}
