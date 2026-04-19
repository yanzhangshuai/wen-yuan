import { z } from "zod";

import {
  CLAIM_REVIEW_STATE_VALUES,
  CLAIM_SOURCE_VALUES,
  RELATION_DIRECTION_VALUES,
  RELATION_TYPE_SOURCE_VALUES
} from "@/server/modules/review/evidence-review/review-state";
import type {
  ClaimReviewState,
  ClaimSource,
  RelationDirection,
  RelationTypeSource
} from "@/server/modules/review/evidence-review/review-state";

// 统一复用审核模块中的状态枚举，确保 analysis/review 对同一事实域语义一致。
export const claimSourceSchema = z.enum(CLAIM_SOURCE_VALUES);
export const claimReviewStateSchema = z.enum(CLAIM_REVIEW_STATE_VALUES);
export const relationDirectionSchema = z.enum(RELATION_DIRECTION_VALUES);
export const relationTypeSourceSchema = z.enum(RELATION_TYPE_SOURCE_VALUES);

export const claimLineageSchema = z.object({
  supersedesClaimId : z.string().uuid().nullable(),
  derivedFromClaimId: z.string().uuid().nullable()
});

export const claimAuditFieldsSchema = z.object({
  source          : claimSourceSchema,
  reviewState     : claimReviewStateSchema,
  runId           : z.string().uuid(),
  createdByUserId : z.string().uuid().nullable(),
  reviewedByUserId: z.string().uuid().nullable(),
  reviewNote      : z.string().trim().min(1).nullable()
});

export const evidenceBindingSchema = z.object({
  evidenceSpanIds: z.array(z.string().uuid()).min(1)
});

export const relationTypeSelectionSchema = z.object({
  relationTypeKey   : z.string().trim().min(1),
  relationLabel     : z.string().trim().min(1),
  relationTypeSource: relationTypeSourceSchema,
  direction         : relationDirectionSchema
});

export const claimEnvelopeSchema = claimAuditFieldsSchema
  .merge(evidenceBindingSchema)
  .merge(claimLineageSchema);

export type { ClaimReviewState, ClaimSource, RelationDirection, RelationTypeSource };

export type ClaimEnvelope = z.infer<typeof claimEnvelopeSchema>;
export type RelationTypeSelection = z.infer<typeof relationTypeSelectionSchema>;
