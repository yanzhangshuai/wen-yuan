import { z } from "zod";

import {
  AliasType,
  BioCategory,
  IdentityClaim,
  MentionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";
import { relationDirectionSchema } from "@/server/modules/analysis/claims/base-types";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import type { PersistedStage0Segment } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import { PipelineStage } from "@/types/pipeline";

export const STAGE_A_STAGE_KEY = "stage_a_extraction";
export const STAGE_A_PIPELINE_STAGE = PipelineStage.INDEPENDENT_EXTRACTION;
export const STAGE_A_PROMPT_VERSION = "2026-04-19-stage-a-v1";

const confidenceSchema = z.number().finite().min(0).max(1);
const localRefSchema = z.string().trim().min(1);
const nullableRefSchema = localRefSchema.nullable().default(null);
const nullableTrimmedTextSchema = z.string().trim().min(1).nullable().default(null);
const nullablePositiveIntSchema = z.number().int().positive().nullable().default(null);

export const stageAEvidenceReferenceSchema = z.object({
  segmentIndex: z.number().int().nonnegative(),
  quotedText  : z.string().trim().min(1)
});

export const stageAMentionItemSchema = z.object({
  mentionRef   : localRefSchema,
  surfaceText  : z.string().trim().min(1),
  mentionKind  : z.nativeEnum(MentionKind),
  identityClaim: z.nativeEnum(IdentityClaim).nullable().default(null),
  aliasTypeHint: z.nativeEnum(AliasType).nullable().default(null),
  confidence   : confidenceSchema,
  evidence     : stageAEvidenceReferenceSchema
});

export const stageATimeItemSchema = z
  .object({
    timeRef            : localRefSchema,
    rawTimeText        : z.string().trim().min(1),
    timeType           : z.nativeEnum(TimeType),
    normalizedLabel    : z.string().trim().min(1),
    relativeOrderWeight: z.number().finite().nullable().default(null),
    chapterRangeStart  : nullablePositiveIntSchema,
    chapterRangeEnd    : nullablePositiveIntSchema,
    confidence         : confidenceSchema,
    evidence           : stageAEvidenceReferenceSchema
  })
  .superRefine((value, ctx) => {
    if (
      value.chapterRangeStart !== null
      && value.chapterRangeEnd !== null
      && value.chapterRangeStart > value.chapterRangeEnd
    ) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["chapterRangeEnd"],
        message: "chapterRangeEnd must be greater than or equal to chapterRangeStart"
      });
    }
  });

export const stageAEventItemSchema = z.object({
  eventRef         : localRefSchema,
  subjectMentionRef: nullableRefSchema,
  predicate        : z.string().trim().min(1).max(120),
  objectText       : nullableTrimmedTextSchema,
  locationText     : nullableTrimmedTextSchema,
  timeRef          : nullableRefSchema,
  eventCategory    : z.nativeEnum(BioCategory),
  narrativeLens    : z.nativeEnum(NarrativeLens),
  confidence       : confidenceSchema,
  evidence         : stageAEvidenceReferenceSchema
});

export const stageARelationItemSchema = z
  .object({
    relationRef          : localRefSchema,
    sourceMentionRef     : nullableRefSchema,
    targetMentionRef     : nullableRefSchema,
    relationTypeKey      : z.string().trim().min(1),
    relationLabel        : z.string().trim().min(1),
    direction            : relationDirectionSchema,
    effectiveChapterStart: nullablePositiveIntSchema,
    effectiveChapterEnd  : nullablePositiveIntSchema,
    timeRef              : nullableRefSchema,
    confidence           : confidenceSchema,
    evidence             : stageAEvidenceReferenceSchema
  })
  .superRefine((value, ctx) => {
    if (
      value.effectiveChapterStart !== null
      && value.effectiveChapterEnd !== null
      && value.effectiveChapterStart > value.effectiveChapterEnd
    ) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["effectiveChapterEnd"],
        message: "effectiveChapterEnd must be greater than or equal to effectiveChapterStart"
      });
    }
  });

export const stageARawEnvelopeSchema = z.object({
  mentions : z.array(z.unknown()).default([]),
  times    : z.array(z.unknown()).default([]),
  events   : z.array(z.unknown()).default([]),
  relations: z.array(z.unknown()).default([])
});

export type StageARawEnvelope = z.infer<typeof stageARawEnvelopeSchema>;
export type StageAMentionItem = z.infer<typeof stageAMentionItemSchema>;
export type StageATimeItem = z.infer<typeof stageATimeItemSchema>;
export type StageAEventItem = z.infer<typeof stageAEventItemSchema>;
export type StageARelationItem = z.infer<typeof stageARelationItemSchema>;

export type StageAClaimKind = "MENTION" | "TIME" | "EVENT" | "RELATION";

export type StageADiscardCode =
  | "SCHEMA_VALIDATION"
  | "SEGMENT_INDEX_OUT_OF_RANGE"
  | "QUOTE_NOT_FOUND"
  | "QUOTE_NOT_UNIQUE"
  | "EVIDENCE_VALIDATION_FAILED"
  | "UNRESOLVED_MENTION_REF"
  | "UNRESOLVED_TIME_REF";

export interface StageADiscardRecord {
  kind   : StageAClaimKind;
  ref    : string;
  code   : StageADiscardCode;
  message: string;
}

export interface StageANormalizedClaim<TFamily extends "ENTITY_MENTION" | "TIME"> {
  ref  : string;
  draft: ClaimDraftByFamily[TFamily];
}

export interface StageAPendingEventClaim {
  ref              : string;
  subjectMentionRef: string | null;
  timeRef          : string | null;
  draft            : ClaimDraftByFamily["EVENT"];
}

export interface StageAPendingRelationClaim {
  ref             : string;
  sourceMentionRef: string | null;
  targetMentionRef: string | null;
  timeRef         : string | null;
  draft           : ClaimDraftByFamily["RELATION"];
}

export interface StageANormalizedExtraction {
  mentionClaims        : Array<StageANormalizedClaim<"ENTITY_MENTION">>;
  timeClaims           : Array<StageANormalizedClaim<"TIME">>;
  pendingEventClaims   : StageAPendingEventClaim[];
  pendingRelationClaims: StageAPendingRelationClaim[];
  discardRecords       : StageADiscardRecord[];
}

export interface StageAPersistResult {
  mentionIdsByRef: Record<string, string>;
  timeIdsByRef   : Record<string, string>;
  persistedCounts: {
    mentions : number;
    times    : number;
    events   : number;
    relations: number;
  };
  discardRecords: StageADiscardRecord[];
}

export interface StageAChapterPromptInput {
  bookId      : string;
  chapterId   : string;
  chapterNo   : number;
  chapterTitle: string;
  chapterText : string;
  segments    : PersistedStage0Segment[];
}

export interface StageAExtractionRunInput {
  bookId  : string;
  runId   : string | null;
  jobId   : string;
  attempt?: number;
  chapter: {
    id     : string;
    no     : number;
    title  : string;
    content: string;
  };
}

export interface StageAExtractionRunResult {
  bookId         : string;
  chapterId      : string;
  runId          : string | null;
  stageRunId     : string | null;
  rawOutputId    : string | null;
  modelId        : string | null;
  isFallback     : boolean;
  inputCount     : number;
  outputCount    : number;
  skippedCount   : number;
  persistedCounts: {
    mentions : number;
    times    : number;
    events   : number;
    relations: number;
  };
  discardRecords: StageADiscardRecord[];
}

export function summarizeStageADiscards(
  discards: StageADiscardRecord[]
): string | null {
  if (discards.length === 0) {
    return null;
  }

  const counts = new Map<StageADiscardCode, number>();
  for (const discard of discards) {
    counts.set(discard.code, (counts.get(discard.code) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([code, count]) => `${code}:${count}`)
    .join(", ");
}
