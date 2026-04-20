import { prisma } from "@/server/db/prisma";
import {
  createClaimRepository,
  type ClaimRepository,
  type ClaimWriteScope
} from "@/server/modules/analysis/claims/claim-repository";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import type { ClaimDraftByFamily } from "@/server/modules/analysis/claims/claim-schemas";
import {
  STAGE_C_STAGE_KEY,
  type StageCPersistedCounts
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

type StageCClaimWriteService = Pick<ReturnType<typeof createClaimWriteService>, "writeClaimBatch">;

export interface PersistStageCFactAttributionDraftsInput {
  bookId          : string;
  runId           : string;
  scopedChapterIds: string[];
  eventDrafts     : ClaimDraftByFamily["EVENT"][];
  relationDrafts  : ClaimDraftByFamily["RELATION"][];
}

export interface StageCPersisterDependencies {
  claimRepository  ?: ClaimRepository;
  claimWriteService?: StageCClaimWriteService;
}

export interface StageCPersister {
  persistFactAttributionDrafts(input: PersistStageCFactAttributionDraftsInput): Promise<StageCPersistedCounts>;
}

/**
 * Persists Stage C derived facts chapter-by-chapter.
 * Empty family batches are intentional: reruns must clear stale derived rows
 * even when the latest attribution pass emits no replacements for a scope.
 */
export function createStageCPersister(
  dependencies: StageCPersisterDependencies = {}
): StageCPersister {
  const claimRepository = dependencies.claimRepository ?? createClaimRepository(prisma);

  async function persistFactAttributionDrafts(
    input: PersistStageCFactAttributionDraftsInput
  ): Promise<StageCPersistedCounts> {
    if (dependencies.claimWriteService !== undefined) {
      return persistWithClaimWriteService(dependencies.claimWriteService, input);
    }

    return claimRepository.transaction(async (txRepository) => {
      const claimWriteService = createClaimWriteService(txRepository);
      return persistWithClaimWriteService(claimWriteService, input);
    });
  }

  return { persistFactAttributionDrafts };
}

async function persistWithClaimWriteService(
  claimWriteService: StageCClaimWriteService,
  input: PersistStageCFactAttributionDraftsInput
): Promise<StageCPersistedCounts> {
  const eventDraftsByChapterId = groupDraftsByChapterId(input.eventDrafts);
  const relationDraftsByChapterId = groupDraftsByChapterId(input.relationDrafts);

  let deletedCount = 0;
  let createdCount = 0;

  for (const chapterId of uniqueChapterIds(input.scopedChapterIds)) {
    const eventResult = await claimWriteService.writeClaimBatch({
      family: "EVENT",
      scope : buildScope(input, chapterId),
      drafts: eventDraftsByChapterId.get(chapterId) ?? []
    });
    deletedCount += eventResult.deletedCount;
    createdCount += eventResult.createdCount;

    const relationResult = await claimWriteService.writeClaimBatch({
      family: "RELATION",
      scope : buildScope(input, chapterId),
      drafts: relationDraftsByChapterId.get(chapterId) ?? []
    });
    deletedCount += relationResult.deletedCount;
    createdCount += relationResult.createdCount;
  }

  return { deletedCount, createdCount };
}

function buildScope(
  input: Pick<PersistStageCFactAttributionDraftsInput, "bookId" | "runId">,
  chapterId: string
): ClaimWriteScope {
  return {
    bookId  : input.bookId,
    chapterId,
    runId   : input.runId,
    stageKey: STAGE_C_STAGE_KEY
  };
}

function groupDraftsByChapterId<TDraft extends { chapterId: string }>(
  drafts: TDraft[]
): Map<string, TDraft[]> {
  const grouped = new Map<string, TDraft[]>();

  for (const draft of drafts) {
    const existing = grouped.get(draft.chapterId) ?? [];
    existing.push(draft);
    grouped.set(draft.chapterId, existing);
  }

  return grouped;
}

function uniqueChapterIds(chapterIds: string[]): string[] {
  return Array.from(new Set(chapterIds));
}

export const stageCPersister = createStageCPersister();
