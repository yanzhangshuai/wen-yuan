import type { ClaimReviewState } from "@/server/modules/analysis/claims/base-types";
import type { ReviewableClaimFamily } from "@/server/modules/analysis/claims/claim-schemas";

import type {
  KnowledgeReviewState,
  KnowledgeScopeType
} from "@/server/modules/knowledge-v2/base-types";
import type { KnownKnowledgeType } from "@/server/modules/knowledge-v2/payload-schemas";
import type { KnowledgeRepository } from "@/server/modules/knowledge-v2/repository";

export type KnowledgePromotionTargetReviewState = Extract<
  KnowledgeReviewState,
  "PENDING" | "VERIFIED"
>;

export interface PromotableClaimSummary {
  id         : string;
  family     : ReviewableClaimFamily;
  reviewState: ClaimReviewState;
  bookId     : string;
  chapterId  : string | null;
  runId      : string;
}

export interface ClaimLookupRepository {
  findPromotableClaim(input: {
    family : ReviewableClaimFamily;
    claimId: string;
  }): Promise<PromotableClaimSummary | null>;
}

export interface KnowledgePromotionRepository
  extends Pick<KnowledgeRepository, "createKnowledgeItem" | "createSupersedingKnowledgeItem"> {}

export interface PromoteReviewedClaimInput {
  claimFamily          : ReviewableClaimFamily;
  claimId              : string;
  knowledgeType        : KnownKnowledgeType;
  scopeType            : KnowledgeScopeType;
  scopeId              : string | null;
  payload              : unknown;
  actorUserId          : string;
  targetReviewState    : KnowledgePromotionTargetReviewState;
  supersedesKnowledgeId: string | null;
}

export class KnowledgePromotionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "KnowledgePromotionError";
  }
}

function isPromotableClaimReviewState(
  reviewState: ClaimReviewState
): reviewState is Extract<ClaimReviewState, "ACCEPTED"> {
  return reviewState === "ACCEPTED";
}

function resolveScopeId(input: {
  scopeType: KnowledgeScopeType;
  scopeId  : string | null;
  claim    : PromotableClaimSummary;
}): string | null {
  if (input.scopeType === "GLOBAL") {
    return null;
  }

  if (input.scopeType === "BOOK") {
    return input.scopeId ?? input.claim.bookId;
  }

  if (input.scopeType === "RUN") {
    return input.scopeId ?? input.claim.runId;
  }

  if (input.scopeId === null) {
    throw new KnowledgePromotionError("BOOK_TYPE promotion requires explicit scopeId");
  }

  return input.scopeId;
}

function buildReviewAudit(input: {
  actorUserId      : string;
  targetReviewState: KnowledgePromotionTargetReviewState;
}): {
  reviewedByUserId: string | null;
  reviewedAt      : Date | null;
} {
  if (input.targetReviewState === "PENDING") {
    return {
      reviewedByUserId: null,
      reviewedAt      : null
    };
  }

  return {
    reviewedByUserId: input.actorUserId,
    reviewedAt      : new Date()
  };
}

export function createKnowledgePromotionService(dependencies: {
  claimLookup        : ClaimLookupRepository;
  knowledgeRepository: KnowledgePromotionRepository;
}) {
  return {
    async promoteReviewedClaim(input: PromoteReviewedClaimInput) {
      const claim = await dependencies.claimLookup.findPromotableClaim({
        family : input.claimFamily,
        claimId: input.claimId
      });

      if (claim === null) {
        throw new KnowledgePromotionError(
          `Claim ${input.claimId} was not found in family ${input.claimFamily}`
        );
      }

      if (claim.family !== input.claimFamily) {
        throw new KnowledgePromotionError(
          `Claim ${input.claimId} belongs to family ${claim.family}, expected ${input.claimFamily}`
        );
      }

      if (!isPromotableClaimReviewState(claim.reviewState)) {
        throw new KnowledgePromotionError(
          `Claim ${input.claimId} is not promotable because reviewState=${claim.reviewState}`
        );
      }

      const reviewAudit = buildReviewAudit({
        actorUserId      : input.actorUserId,
        targetReviewState: input.targetReviewState
      });

      if (input.supersedesKnowledgeId !== null) {
        return dependencies.knowledgeRepository.createSupersedingKnowledgeItem({
          supersedesKnowledgeId  : input.supersedesKnowledgeId,
          payload                : input.payload,
          source                 : "CLAIM_PROMOTION",
          reviewState            : input.targetReviewState,
          confidence             : null,
          effectiveFrom          : null,
          effectiveTo            : null,
          promotedFromClaimId    : claim.id,
          promotedFromClaimFamily: claim.family,
          createdByUserId        : input.actorUserId,
          reviewedByUserId       : reviewAudit.reviewedByUserId,
          reviewedAt             : reviewAudit.reviewedAt
        });
      }

      return dependencies.knowledgeRepository.createKnowledgeItem({
        scopeType: input.scopeType,
        scopeId  : resolveScopeId({
          scopeType: input.scopeType,
          scopeId  : input.scopeId,
          claim
        }),
        knowledgeType          : input.knowledgeType,
        payload                : input.payload,
        source                 : "CLAIM_PROMOTION",
        reviewState            : input.targetReviewState,
        confidence             : null,
        effectiveFrom          : null,
        effectiveTo            : null,
        promotedFromClaimId    : claim.id,
        promotedFromClaimFamily: claim.family,
        createdByUserId        : input.actorUserId,
        reviewedByUserId       : reviewAudit.reviewedByUserId,
        reviewedAt             : reviewAudit.reviewedAt
      });
    }
  };
}
