import {
  createClaimRepository,
  type ClaimRepository
} from "@/server/modules/analysis/claims/claim-repository";
import {
  toClaimCreateData,
  validateClaimDraftByFamily
} from "@/server/modules/analysis/claims/claim-schemas";
import { prisma } from "@/server/db/prisma";
import { STAGE_B5_STAGE_KEY } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

export interface StageB5PersisterDependencies {
  claimRepository?: Pick<
    ClaimRepository,
    "transaction" | "replaceClaimFamilyScope" | "createReviewableClaim"
  >;
}

export function createStageB5Persister(dependencies: StageB5PersisterDependencies = {}) {
  const claimRepository = dependencies.claimRepository ?? createClaimRepository(prisma);

  async function persistConflictDrafts(input: {
    bookId: string;
    runId : string;
    drafts: unknown[];
  }): Promise<{ createdCount: number }> {
    return claimRepository.transaction(async (txRepository) => {
      await txRepository.replaceClaimFamilyScope({
        family: "CONFLICT_FLAG",
        scope : {
          bookId  : input.bookId,
          runId   : input.runId,
          stageKey: STAGE_B5_STAGE_KEY
        },
        rows: []
      });

      let createdCount = 0;
      for (const draft of input.drafts) {
        const validated = validateClaimDraftByFamily("CONFLICT_FLAG", draft);
        await txRepository.createReviewableClaim(
          "CONFLICT_FLAG",
          toClaimCreateData<"CONFLICT_FLAG">(validated)
        );
        createdCount += 1;
      }

      return { createdCount };
    });
  }

  return { persistConflictDrafts };
}

export type StageB5Persister = ReturnType<typeof createStageB5Persister>;

export const stageB5Persister = createStageB5Persister();
