/**
 * Claim DTO 的唯一校验入口。
 * 后续 Stage A/A+/B/B.5/C 与 review 写路径都必须先经过这里，
 * 避免各层直接拼 Prisma claim table payload 而让规则漂移。
 */

import { z } from "zod";

import {
  AliasClaimKind,
  AliasType,
  BioCategory,
  ClaimKind,
  ConflictType,
  IdentityClaim,
  IdentityResolutionKind,
  MentionKind,
  NarrativeLens,
  TimeType
} from "@/generated/prisma/enums";
import {
  claimAuditFieldsSchema,
  claimLineageSchema,
  claimReviewStateSchema,
  claimSourceSchema,
  evidenceBindingSchema,
  relationTypeSelectionSchema
} from "@/server/modules/analysis/claims/base-types";

const uuidSchema = z.string().uuid();
const nullableUuidSchema = uuidSchema.nullable();
const nullableTrimmedTextSchema = z.union([z.string().trim().min(1), z.null()]);
const confidenceSchema = z.number().finite().min(0).max(1);

export const CLAIM_FAMILY_VALUES = Object.freeze([
  "ENTITY_MENTION",
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION",
  "CONFLICT_FLAG"
] as const);

export type ClaimFamily = (typeof CLAIM_FAMILY_VALUES)[number];

export const MANUAL_OVERRIDE_FAMILY_VALUES = Object.freeze([
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION"
] as const);

export type ManualOverrideFamily = (typeof MANUAL_OVERRIDE_FAMILY_VALUES)[number];

export const REVIEWABLE_CLAIM_FAMILY_VALUES = Object.freeze([
  "ALIAS",
  "EVENT",
  "RELATION",
  "TIME",
  "IDENTITY_RESOLUTION",
  "CONFLICT_FLAG"
] as const);

export type ReviewableClaimFamily = (typeof REVIEWABLE_CLAIM_FAMILY_VALUES)[number];

export const claimFamilySchema = z.enum(CLAIM_FAMILY_VALUES);
export const manualOverrideFamilySchema = z.enum(MANUAL_OVERRIDE_FAMILY_VALUES);
export const reviewableClaimFamilySchema = z.enum(REVIEWABLE_CLAIM_FAMILY_VALUES);

const baseEntityScopeSchema = z.object({
  bookId    : uuidSchema,
  chapterId : uuidSchema,
  runId     : uuidSchema,
  source    : claimSourceSchema,
  confidence: confidenceSchema
});

const lineageCapableClaimBaseSchema = z.object({
  bookId    : uuidSchema,
  chapterId : nullableUuidSchema,
  confidence: confidenceSchema
})
  .merge(claimAuditFieldsSchema)
  .merge(evidenceBindingSchema)
  .merge(claimLineageSchema);

function addManualCreatorIssue(
  value: { source: string; createdByUserId: string | null },
  ctx: z.RefinementCtx
): void {
  if (value.source === "MANUAL" && value.createdByUserId === null) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["createdByUserId"],
      message: "Manual claims must record createdByUserId"
    });
  }
}

export const entityMentionDraftSchema = baseEntityScopeSchema.extend({
  claimFamily              : z.literal("ENTITY_MENTION"),
  surfaceText              : z.string().trim().min(1),
  mentionKind              : z.nativeEnum(MentionKind),
  identityClaim            : z.nativeEnum(IdentityClaim).nullable(),
  aliasTypeHint            : z.nativeEnum(AliasType).nullable(),
  speakerPersonaCandidateId: nullableUuidSchema,
  suspectedResolvesTo      : nullableUuidSchema,
  evidenceSpanId           : uuidSchema
}).superRefine((value, ctx) => {
  if (value.source === "MANUAL") {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["source"],
      message: "ENTITY_MENTION does not support manual claim writes"
    });
  }
});

export const aliasClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily             : z.literal("ALIAS"),
  aliasText               : z.string().trim().min(1),
  aliasType               : z.nativeEnum(AliasType),
  personaCandidateId      : nullableUuidSchema,
  targetPersonaCandidateId: nullableUuidSchema,
  claimKind               : z.nativeEnum(AliasClaimKind)
}).superRefine(addManualCreatorIssue);

export const eventClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily              : z.literal("EVENT"),
  chapterId                : uuidSchema,
  subjectMentionId         : nullableUuidSchema,
  subjectPersonaCandidateId: nullableUuidSchema,
  predicate                : z.string().trim().min(1).max(120),
  objectText               : nullableTrimmedTextSchema,
  objectPersonaCandidateId : nullableUuidSchema,
  locationText             : nullableTrimmedTextSchema,
  timeHintId               : nullableUuidSchema,
  eventCategory            : z.nativeEnum(BioCategory),
  narrativeLens            : z.nativeEnum(NarrativeLens)
}).superRefine(addManualCreatorIssue);

export const relationClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily             : z.literal("RELATION"),
  chapterId               : uuidSchema,
  sourceMentionId         : nullableUuidSchema,
  targetMentionId         : nullableUuidSchema,
  sourcePersonaCandidateId: nullableUuidSchema,
  targetPersonaCandidateId: nullableUuidSchema,
  effectiveChapterStart   : z.number().int().positive().nullable(),
  effectiveChapterEnd     : z.number().int().positive().nullable(),
  timeHintId              : nullableUuidSchema
})
  .merge(relationTypeSelectionSchema)
  .superRefine((value, ctx) => {
    addManualCreatorIssue(value, ctx);

    if (
      value.effectiveChapterStart !== null &&
      value.effectiveChapterEnd !== null &&
      value.effectiveChapterStart > value.effectiveChapterEnd
    ) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["effectiveChapterEnd"],
        message: "effectiveChapterEnd must be greater than or equal to effectiveChapterStart"
      });
    }
  });

export const timeClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily        : z.literal("TIME"),
  chapterId          : uuidSchema,
  rawTimeText        : z.string().trim().min(1),
  timeType           : z.nativeEnum(TimeType),
  normalizedLabel    : z.string().trim().min(1),
  relativeOrderWeight: z.number().finite().nullable(),
  chapterRangeStart  : z.number().int().positive().nullable(),
  chapterRangeEnd    : z.number().int().positive().nullable()
}).superRefine((value, ctx) => {
  addManualCreatorIssue(value, ctx);

  if (
    value.chapterRangeStart !== null &&
    value.chapterRangeEnd !== null &&
    value.chapterRangeStart > value.chapterRangeEnd
  ) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["chapterRangeEnd"],
      message: "chapterRangeEnd must be greater than or equal to chapterRangeStart"
    });
  }
});

export const identityResolutionClaimDraftSchema = lineageCapableClaimBaseSchema.extend({
  claimFamily       : z.literal("IDENTITY_RESOLUTION"),
  mentionId         : uuidSchema,
  personaCandidateId: nullableUuidSchema,
  resolvedPersonaId : nullableUuidSchema,
  resolutionKind    : z.nativeEnum(IdentityResolutionKind),
  rationale         : nullableTrimmedTextSchema
}).superRefine(addManualCreatorIssue);

export const conflictFlagDraftSchema = z.object({
  claimFamily     : z.literal("CONFLICT_FLAG"),
  bookId          : uuidSchema,
  chapterId       : nullableUuidSchema,
  runId           : uuidSchema,
  conflictType    : z.nativeEnum(ConflictType),
  relatedClaimKind: z.nativeEnum(ClaimKind).nullable(),
  relatedClaimIds : z.array(uuidSchema),
  summary         : z.string().trim().min(1),
  evidenceSpanIds : z.array(uuidSchema).min(1),
  reviewState     : claimReviewStateSchema,
  source          : claimSourceSchema,
  reviewedByUserId: nullableUuidSchema,
  reviewNote      : nullableTrimmedTextSchema
}).superRefine((value, ctx) => {
  if (value.source === "MANUAL") {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["source"],
      message: "CONFLICT_FLAG does not support manual claim writes"
    });
  }
});

export const claimDraftSchemaByFamily = {
  ENTITY_MENTION     : entityMentionDraftSchema,
  ALIAS              : aliasClaimDraftSchema,
  EVENT              : eventClaimDraftSchema,
  RELATION           : relationClaimDraftSchema,
  TIME               : timeClaimDraftSchema,
  IDENTITY_RESOLUTION: identityResolutionClaimDraftSchema,
  CONFLICT_FLAG      : conflictFlagDraftSchema
} as const;

export const claimDraftSchema = z.union([
  entityMentionDraftSchema,
  aliasClaimDraftSchema,
  eventClaimDraftSchema,
  relationClaimDraftSchema,
  timeClaimDraftSchema,
  identityResolutionClaimDraftSchema,
  conflictFlagDraftSchema
]);

export interface ClaimDraftByFamily {
  ENTITY_MENTION     : z.infer<typeof entityMentionDraftSchema>;
  ALIAS              : z.infer<typeof aliasClaimDraftSchema>;
  EVENT              : z.infer<typeof eventClaimDraftSchema>;
  RELATION           : z.infer<typeof relationClaimDraftSchema>;
  TIME               : z.infer<typeof timeClaimDraftSchema>;
  IDENTITY_RESOLUTION: z.infer<typeof identityResolutionClaimDraftSchema>;
  CONFLICT_FLAG      : z.infer<typeof conflictFlagDraftSchema>;
}

export type ClaimDraft = ClaimDraftByFamily[ClaimFamily];

export type ClaimCreateDataByFamily = {
  [TFamily in ClaimFamily]: Omit<ClaimDraftByFamily[TFamily], "claimFamily">;
};

/**
 * 用于 family 未知的写入口，例如上游先解析 JSON、后再按 discriminated union 分流。
 */
export function validateClaimDraft(draft: unknown): ClaimDraft {
  return claimDraftSchema.parse(draft);
}

/**
 * 用于 family 已知的写入口，保留更精确的返回类型给 repository/service。
 */
export function validateClaimDraftByFamily<TFamily extends ClaimFamily>(
  family: TFamily,
  draft: unknown
): ClaimDraftByFamily[TFamily] {
  return claimDraftSchemaByFamily[family].parse(draft) as ClaimDraftByFamily[TFamily];
}

/**
 * Prisma createMany/create 的 payload 不需要 discriminant，统一在这里剥离，
 * 避免后续各写路径重复手拆字段。
 */
export function toClaimCreateData<TFamily extends ClaimFamily>(
  draft: ClaimDraftByFamily[TFamily]
): ClaimCreateDataByFamily[TFamily] {
  const { claimFamily: _claimFamily, ...data } = draft;
  return data as ClaimCreateDataByFamily[TFamily];
}

/**
 * 仅 lineage-capable family 允许 manual override；entity mention 与 conflict flag 明确排除。
 */
export function isManualOverrideFamily(family: ClaimFamily): family is ManualOverrideFamily {
  return MANUAL_OVERRIDE_FAMILY_VALUES.includes(family as ManualOverrideFamily);
}
