import {
  createClaimRepository,
  type ClaimWriteScope
} from "@/server/modules/analysis/claims/claim-repository";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import { prisma } from "@/server/db/prisma";
import type {
  StageAPlusPersistedCounts,
  StageAPlusRecallOutput
} from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/types";

export interface StageAPlusClaimWriteService {
  writeClaimBatch(
    input: Parameters<ReturnType<typeof createClaimWriteService>["writeClaimBatch"]>[0]
  ): Promise<{
    deletedCount: number;
    createdCount: number;
  }>;
}

export interface PersistStageAPlusClaimsInput {
  scope       : ClaimWriteScope;
  recallOutput: StageAPlusRecallOutput;
}

export interface PersistStageAPlusClaimsResult {
  persistedCounts : StageAPlusPersistedCounts;
  knowledgeItemIds: string[];
}

export interface StageAPlusClaimPersisterDependencies {
  claimWriteService?: StageAPlusClaimWriteService;
}

export function createStageAPlusClaimPersister(
  dependencies: StageAPlusClaimPersisterDependencies = {}
) {
  const claimWriteService = dependencies.claimWriteService
    ?? createClaimWriteService(createClaimRepository(prisma));

  async function persistStageAPlusClaims(
    input: PersistStageAPlusClaimsInput
  ): Promise<PersistStageAPlusClaimsResult> {
    const mentionResult = await claimWriteService.writeClaimBatch({
      family: "ENTITY_MENTION",
      scope : input.scope,
      drafts: input.recallOutput.mentionDrafts
    });
    const aliasResult = await claimWriteService.writeClaimBatch({
      family: "ALIAS",
      scope : input.scope,
      drafts: input.recallOutput.aliasDrafts
    });
    const relationResult = await claimWriteService.writeClaimBatch({
      family: "RELATION",
      scope : input.scope,
      drafts: input.recallOutput.relationDrafts
    });

    return {
      persistedCounts: {
        mentions : mentionResult.createdCount,
        aliases  : aliasResult.createdCount,
        relations: relationResult.createdCount
      },
      knowledgeItemIds: Array.from(new Set(input.recallOutput.knowledgeItemIds))
    };
  }

  return { persistStageAPlusClaims };
}

export type StageAPlusClaimPersister = ReturnType<typeof createStageAPlusClaimPersister>;

export const stageAPlusClaimPersister = createStageAPlusClaimPersister();
