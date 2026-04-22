import { z } from "zod";

import {
  claimDraftSchemaByFamily,
  type ClaimCreateDataByFamily,
  type ClaimDraftByFamily,
  type ManualOverrideFamily,
  MANUAL_OVERRIDE_FAMILY_VALUES,
  REVIEWABLE_CLAIM_FAMILY_VALUES
} from "@/server/modules/analysis/claims/claim-schemas";
import {
  CLAIM_REVIEW_STATE_VALUES,
  CLAIM_SOURCE_VALUES
} from "@/server/modules/review/evidence-review/review-state";

const reviewNoteSchema = z.string().trim().min(1).max(2000).nullable().optional();
const uuidSchema = z.string().uuid();
const nonEmptyUuidArraySchema = z.array(uuidSchema).min(1);
const reviewManualClaimDraftPayloadSchema = z.record(z.string(), z.unknown());
const REVIEW_MANUAL_CLAIM_PLACEHOLDER_USER_ID = "00000000-0000-4000-8000-000000000000";

export const reviewClaimKindSchema = z.enum(REVIEWABLE_CLAIM_FAMILY_VALUES);
export const reviewManualClaimKindSchema = z.enum(MANUAL_OVERRIDE_FAMILY_VALUES);

export const reviewClaimListQuerySchema = z.object({
  bookId       : uuidSchema,
  claimKinds   : z.array(reviewClaimKindSchema).optional(),
  reviewStates : z.array(z.enum(CLAIM_REVIEW_STATE_VALUES)).optional(),
  sources      : z.array(z.enum(CLAIM_SOURCE_VALUES)).optional(),
  personaId    : uuidSchema.optional(),
  chapterId    : uuidSchema.optional(),
  timeLabel    : z.string().trim().min(1).max(200).optional(),
  conflictState: z.enum(["ACTIVE", "NONE"] as const).optional(),
  limit        : z.coerce.number().int().min(0).optional(),
  offset       : z.coerce.number().int().min(0).optional()
});

export const reviewPersonaChapterMatrixQuerySchema = z.object({
  bookId        : uuidSchema,
  personaId     : uuidSchema.optional(),
  chapterId     : uuidSchema.optional(),
  reviewStates  : z.array(z.enum(CLAIM_REVIEW_STATE_VALUES)).optional(),
  conflictState : z.enum(["ACTIVE", "NONE"] as const).optional(),
  limitPersonas : z.coerce.number().int().min(0).optional(),
  offsetPersonas: z.coerce.number().int().min(0).optional()
});

export const reviewRelationEditorQuerySchema = z.object({
  bookId          : uuidSchema,
  personaId       : uuidSchema.optional(),
  pairPersonaId   : uuidSchema.optional(),
  relationTypeKeys: z.array(z.string().trim().min(1).max(120)).optional(),
  reviewStates    : z.array(z.enum(CLAIM_REVIEW_STATE_VALUES)).optional(),
  conflictState   : z.enum(["ACTIVE", "NONE"] as const).optional(),
  limitPairs      : z.coerce.number().int().min(0).optional(),
  offsetPairs     : z.coerce.number().int().min(0).optional()
}).superRefine((value, ctx) => {
  if (value.pairPersonaId && !value.personaId) {
    ctx.addIssue({
      code   : z.ZodIssueCode.custom,
      path   : ["pairPersonaId"],
      message: "pairPersonaId requires personaId"
    });
  }
});

export const reviewClaimDetailQuerySchema = z.object({
  bookId: uuidSchema
});

export const reviewClaimRouteParamsSchema = z.object({
  claimKind: reviewClaimKindSchema,
  claimId  : uuidSchema
});

export const reviewClaimActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    bookId: uuidSchema,
    action: z.enum(["ACCEPT", "REJECT", "DEFER"] as const),
    note  : reviewNoteSchema
  }),
  z.object({
    bookId: uuidSchema,
    action: z.literal("EDIT"),
    note  : reviewNoteSchema,
    draft : z.record(z.string(), z.unknown())
  }),
  z.object({
    bookId         : uuidSchema,
    action         : z.literal("RELINK_EVIDENCE"),
    note           : reviewNoteSchema,
    evidenceSpanIds: nonEmptyUuidArraySchema
  })
]);

export const reviewCreateManualClaimRequestSchema = z.object({
  claimKind: reviewManualClaimKindSchema,
  note     : reviewNoteSchema,
  draft    : z.record(z.string(), z.unknown())
});

export const reviewMergePersonasRequestSchema = z.object({
  bookId             : uuidSchema,
  sourcePersonaId    : uuidSchema,
  targetPersonaId    : uuidSchema,
  personaCandidateIds: nonEmptyUuidArraySchema,
  note               : reviewNoteSchema
});

export const reviewSplitPersonasRequestSchema = z.object({
  bookId         : uuidSchema,
  sourcePersonaId: uuidSchema,
  splitTargets   : z.array(z.object({
    targetPersonaId    : uuidSchema.optional(),
    targetPersonaName  : z.string().trim().min(1).max(120).optional(),
    personaCandidateIds: nonEmptyUuidArraySchema
  })).min(1),
  note: reviewNoteSchema
}).superRefine((value, ctx) => {
  for (const [index, target] of value.splitTargets.entries()) {
    // split target 至少要么指向既有人物，要么声明新人物名称；两者都没有时无法生成稳定 manual claim。
    if (!target.targetPersonaId && !target.targetPersonaName) {
      ctx.addIssue({
        code   : z.ZodIssueCode.custom,
        path   : ["splitTargets", index],
        message: "Each split target requires targetPersonaId or targetPersonaName"
      });
    }
  }
});

export const reviewSplitPersonaRequestSchema = reviewSplitPersonasRequestSchema;

export type ReviewManualClaimDraftInput<TFamily extends ManualOverrideFamily> = Omit<
  ClaimCreateDataByFamily[TFamily],
  | "source"
  | "reviewState"
  | "supersedesClaimId"
  | "derivedFromClaimId"
  | "createdByUserId"
  | "reviewedByUserId"
  | "reviewNote"
>;

function toReviewManualClaimDraft<TFamily extends ManualOverrideFamily>(
  draft: ClaimDraftByFamily[TFamily]
): ReviewManualClaimDraftInput<TFamily> {
  const {
    claimFamily: _claimFamily,
    source: _source,
    reviewState: _reviewState,
    supersedesClaimId: _supersedesClaimId,
    derivedFromClaimId: _derivedFromClaimId,
    createdByUserId: _createdByUserId,
    reviewedByUserId: _reviewedByUserId,
    reviewNote: _reviewNote,
    ...manualDraft
  } = draft;

  return manualDraft as ReviewManualClaimDraftInput<TFamily>;
}

function buildReviewManualClaimDraftValidationPayload<TFamily extends ManualOverrideFamily>(
  claimKind: TFamily,
  draft: Record<string, unknown>
) {
  return {
    claimFamily       : claimKind,
    source            : "MANUAL" as const,
    reviewState       : "ACCEPTED" as const,
    supersedesClaimId : null,
    derivedFromClaimId: null,
    createdByUserId   : REVIEW_MANUAL_CLAIM_PLACEHOLDER_USER_ID,
    reviewedByUserId  : REVIEW_MANUAL_CLAIM_PLACEHOLDER_USER_ID,
    reviewNote        : null,
    ...draft
  };
}

export function safeParseReviewManualClaimDraft<TFamily extends ManualOverrideFamily>(
  claimKind: TFamily,
  draft: unknown
) {
  const parsedDraft = reviewManualClaimDraftPayloadSchema.safeParse(draft);
  if (!parsedDraft.success) {
    return parsedDraft as z.SafeParseReturnType<unknown, ReviewManualClaimDraftInput<TFamily>>;
  }

  const validated = claimDraftSchemaByFamily[claimKind].safeParse(
    buildReviewManualClaimDraftValidationPayload(claimKind, parsedDraft.data)
  );
  if (!validated.success) {
    return validated as z.SafeParseReturnType<unknown, ReviewManualClaimDraftInput<TFamily>>;
  }

  return {
    success: true,
    data   : toReviewManualClaimDraft(validated.data as ClaimDraftByFamily[TFamily])
  } as z.SafeParseReturnType<unknown, ReviewManualClaimDraftInput<TFamily>>;
}

export function parseReviewManualClaimDraft<TFamily extends ManualOverrideFamily>(
  claimKind: TFamily,
  draft: unknown
): ReviewManualClaimDraftInput<TFamily> {
  const parsedDraft = safeParseReviewManualClaimDraft(claimKind, draft);
  if (!parsedDraft.success) {
    throw parsedDraft.error;
  }

  return parsedDraft.data;
}

export type ReviewClaimActionRequest = z.infer<typeof reviewClaimActionRequestSchema>;
export type ReviewCreateManualClaimRequest = z.infer<typeof reviewCreateManualClaimRequestSchema>;
export type ReviewClaimListQueryRequest = z.infer<typeof reviewClaimListQuerySchema>;
export type ReviewPersonaChapterMatrixQueryRequest =
  z.infer<typeof reviewPersonaChapterMatrixQuerySchema>;
export type ReviewRelationEditorQueryRequest = z.infer<typeof reviewRelationEditorQuerySchema>;
export type ReviewClaimRouteParams = z.infer<typeof reviewClaimRouteParamsSchema>;
export type ReviewMergePersonasRequest = z.infer<typeof reviewMergePersonasRequestSchema>;
export type ReviewSplitPersonasRequest = z.infer<typeof reviewSplitPersonasRequestSchema>;
