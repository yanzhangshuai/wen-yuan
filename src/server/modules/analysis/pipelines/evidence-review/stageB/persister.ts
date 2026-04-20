import {
  createClaimRepository,
  type ClaimRepositoryClient
} from "@/server/modules/analysis/claims/claim-repository";
import { createClaimWriteService } from "@/server/modules/analysis/claims/claim-write-service";
import { prisma } from "@/server/db/prisma";
import {
  createStageBRepository,
  type StageBRepository,
  type StageBRepositoryTransactionClient
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/repository";
import {
  STAGE_B_STAGE_KEY,
  type StageBPersistedCounts,
  type StageBResolutionDraftBundle
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

export interface StageBClaimRepository {
  replaceClaimFamilyScope(
    input: Parameters<ReturnType<typeof createClaimRepository>["replaceClaimFamilyScope"]>[0]
  ): Promise<{ deletedCount: number; createdCount: number }>;
}

export interface StageBClaimWriteService {
  writeClaimBatch(
    input: Parameters<ReturnType<typeof createClaimWriteService>["writeClaimBatch"]>[0]
  ): Promise<{ deletedCount: number; createdCount: number }>;
}

export interface StageBPersisterDependencies {
  repository?       : StageBRepository;
  claimRepository?  : StageBClaimRepository;
  claimWriteService?: StageBClaimWriteService;
}

export interface PersistStageBResolutionBundleInput {
  bookId: string;
  runId : string;
  bundle: StageBResolutionDraftBundle;
}

function hasInjectedDependencies(
  dependencies: StageBPersisterDependencies
): dependencies is Required<StageBPersisterDependencies> {
  return Boolean(
    dependencies.repository
    && dependencies.claimRepository
    && dependencies.claimWriteService
  );
}

function hasPartialDependencies(dependencies: StageBPersisterDependencies): boolean {
  return Boolean(
    dependencies.repository
    || dependencies.claimRepository
    || dependencies.claimWriteService
  ) && !hasInjectedDependencies(dependencies);
}

async function persistWithDependencies(input: {
  repository       : StageBRepository;
  claimRepository  : StageBClaimRepository;
  claimWriteService: StageBClaimWriteService;
  payload          : PersistStageBResolutionBundleInput;
}): Promise<{ persistedCounts: StageBPersistedCounts }> {
  await input.claimRepository.replaceClaimFamilyScope({
    family: "IDENTITY_RESOLUTION",
    scope : {
      bookId  : input.payload.bookId,
      runId   : input.payload.runId,
      stageKey: STAGE_B_STAGE_KEY
    },
    rows: []
  });

  await input.repository.clearPersonaCandidatesForRun({
    bookId: input.payload.bookId,
    runId : input.payload.runId
  });

  const candidateIdByRef = new Map<string, string>();

  for (const candidate of input.payload.bundle.personaCandidates) {
    const created = await input.repository.createPersonaCandidate({
      bookId            : input.payload.bookId,
      runId             : input.payload.runId,
      candidateRef      : candidate.candidateRef,
      canonicalLabel    : candidate.canonicalLabel,
      candidateStatus   : candidate.candidateStatus,
      firstSeenChapterNo: candidate.firstSeenChapterNo,
      lastSeenChapterNo : candidate.lastSeenChapterNo,
      mentionCount      : candidate.mentionCount,
      evidenceScore     : candidate.evidenceScore
    });

    candidateIdByRef.set(candidate.candidateRef, created.id);
  }

  const draftsByChapter = new Map<string, StageBResolutionDraftBundle["identityResolutionDrafts"]>();

  for (const draftRow of input.payload.bundle.identityResolutionDrafts) {
    const chapterId = draftRow.draft.chapterId;

    if (!chapterId) {
      throw new Error("Stage B identity resolution drafts must keep a non-null chapterId");
    }

    const current = draftsByChapter.get(chapterId) ?? [];
    current.push(draftRow);
    draftsByChapter.set(chapterId, current);
  }

  let identityResolutionClaims = 0;

  for (const [chapterId, draftRows] of Array.from(draftsByChapter.entries())
    .sort(([left], [right]) => left.localeCompare(right))) {
    const drafts = draftRows.map((draftRow) => {
      const personaCandidateId = candidateIdByRef.get(draftRow.candidateRef);

      if (!personaCandidateId) {
        throw new Error(`Missing persona candidate id for candidateRef=${draftRow.candidateRef}`);
      }

      return {
        ...draftRow.draft,
        personaCandidateId
      };
    });

    const result = await input.claimWriteService.writeClaimBatch({
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId  : input.payload.bookId,
        chapterId,
        runId   : input.payload.runId,
        stageKey: STAGE_B_STAGE_KEY
      },
      drafts
    });

    identityResolutionClaims += result.createdCount;
  }

  return {
    persistedCounts: {
      personaCandidates: input.payload.bundle.personaCandidates.length,
      identityResolutionClaims
    }
  };
}

export function createStageBPersister(
  dependencies: StageBPersisterDependencies = {}
) {
  if (hasPartialDependencies(dependencies)) {
    throw new Error(
      "Stage B persister dependencies must provide repository, claimRepository, and claimWriteService together"
    );
  }

  async function persistResolutionBundle(
    input: PersistStageBResolutionBundleInput
  ): Promise<{ persistedCounts: StageBPersistedCounts }> {
    if (hasInjectedDependencies(dependencies)) {
      return dependencies.repository.transaction(async (repository) => persistWithDependencies({
        repository,
        claimRepository  : dependencies.claimRepository,
        claimWriteService: dependencies.claimWriteService,
        payload          : input
      }));
    }

    return prisma.$transaction(async (tx) => {
      const repository = createStageBRepository(tx as unknown as StageBRepositoryTransactionClient);
      const claimRepository = createClaimRepository(tx as unknown as ClaimRepositoryClient);
      const claimWriteService = createClaimWriteService(claimRepository);

      return persistWithDependencies({
        repository,
        claimRepository,
        claimWriteService,
        payload: input
      });
    });
  }

  return { persistResolutionBundle };
}

export type StageBPersister = ReturnType<typeof createStageBPersister>;

export const stageBPersister = createStageBPersister();
