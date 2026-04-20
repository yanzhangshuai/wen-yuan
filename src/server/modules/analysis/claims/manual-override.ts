import type {
  ClaimCreateDataByFamily,
  ManualOverrideFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import {
  isManualOverrideFamily,
  toClaimCreateData,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import type { ClaimRepository } from "@/server/modules/analysis/claims/claim-repository";
import { assertReviewStateTransition } from "@/server/modules/review/evidence-review/review-state";

export interface CreateManualOverrideInput<TFamily extends ManualOverrideFamily> {
  family         : TFamily;
  originalClaimId: string;
  actorUserId    : string;
  reviewNote?    : string | null;
  draft          : Omit<
    ClaimCreateDataByFamily[TFamily],
    | "source"
    | "reviewState"
    | "supersedesClaimId"
    | "derivedFromClaimId"
    | "createdByUserId"
    | "reviewedByUserId"
    | "reviewNote"
  >;
}

export interface ManualOverrideResult {
  originalClaimId: string;
  manualClaimId  : string;
}

export class ManualOverrideError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ManualOverrideError";
  }
}

export function createManualOverrideService(repository: ClaimRepository) {
  return {
    async createManualOverride<TFamily extends ManualOverrideFamily>(
      input: CreateManualOverrideInput<TFamily>
    ): Promise<ManualOverrideResult> {
      if (!isManualOverrideFamily(input.family)) {
        const unsupportedFamily = String(input.family);
        throw new ManualOverrideError(
          `Claim family ${unsupportedFamily} does not support manual overrides`
        );
      }

      return repository.transaction(async (txRepository) => {
        const original = await txRepository.findReviewableClaimSummary(
          input.family,
          input.originalClaimId
        );

        if (original === null) {
          throw new ManualOverrideError(
            `Original claim ${input.originalClaimId} was not found in family ${input.family}`
          );
        }

        assertReviewStateTransition(original.reviewState, "EDITED");

        const reviewedAt = new Date();
        const manualDraft = validateClaimDraftByFamily(input.family, {
          claimFamily       : input.family,
          ...input.draft,
          source            : "MANUAL",
          reviewState       : "ACCEPTED",
          supersedesClaimId : input.originalClaimId,
          derivedFromClaimId: input.originalClaimId,
          createdByUserId   : input.actorUserId,
          reviewedByUserId  : input.actorUserId,
          reviewNote        : input.reviewNote ?? null
        });

        await txRepository.updateReviewableClaimReviewState({
          family          : input.family,
          claimId         : input.originalClaimId,
          reviewState     : "EDITED",
          reviewedByUserId: input.actorUserId,
          reviewedAt,
          reviewNote      : input.reviewNote ?? null
        });

        const created = await txRepository.createReviewableClaim(input.family, {
          ...toClaimCreateData(manualDraft),
          reviewedAt
        });

        return {
          originalClaimId: input.originalClaimId,
          manualClaimId  : created.id
        };
      });
    }
  };
}
