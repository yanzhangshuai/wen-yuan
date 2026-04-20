import { describe, expect, it, vi } from "vitest";

import { createStageBPersister } from "@/server/modules/analysis/pipelines/evidence-review/stageB/persister";
import { STAGE_B_STAGE_KEY } from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

describe("createStageBPersister", () => {
  it("clears old run output, creates candidates, then writes chapter-grouped claim batches", async () => {
    const repository = {
      transaction                 : vi.fn(async (work: (tx: typeof repository) => Promise<unknown>) => await work(repository)),
      clearPersonaCandidatesForRun: vi.fn().mockResolvedValue(undefined),
      createPersonaCandidate      : vi.fn()
        .mockResolvedValueOnce({ id: "candidate-db-1" })
        .mockResolvedValueOnce({ id: "candidate-db-2" })
    };
    const claimRepository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 2, createdCount: 0 })
    };
    const claimWriteService = {
      writeClaimBatch: vi.fn()
        .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
        .mockResolvedValueOnce({ deletedCount: 0, createdCount: 1 })
    };
    const persister = createStageBPersister({
      repository       : repository as never,
      claimRepository  : claimRepository as never,
      claimWriteService: claimWriteService as never
    });

    const result = await persister.persistResolutionBundle({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates: [
          {
            candidateRef      : "candidate-1",
            canonicalLabel    : "范进",
            candidateStatus   : "OPEN",
            firstSeenChapterNo: 1,
            lastSeenChapterNo : 4,
            mentionCount      : 2,
            evidenceScore     : 0.88
          },
          {
            candidateRef      : "candidate-2",
            canonicalLabel    : "张静斋",
            candidateStatus   : "OPEN",
            firstSeenChapterNo: 3,
            lastSeenChapterNo : 3,
            mentionCount      : 1,
            evidenceScore     : 0.74
          }
        ],
        identityResolutionDrafts: [
          {
            candidateRef: "candidate-1",
            draft       : {
              claimFamily       : "IDENTITY_RESOLUTION",
              bookId            : BOOK_ID,
              chapterId         : "chapter-1",
              runId             : RUN_ID,
              source            : "AI",
              reviewState       : "PENDING",
              createdByUserId   : null,
              reviewedByUserId  : null,
              reviewNote        : "STAGE_B: support=EXACT_NAMED_SURFACE; blocks=NONE",
              supersedesClaimId : null,
              derivedFromClaimId: null,
              evidenceSpanIds   : ["evidence-1"],
              confidence        : 0.74,
              mentionId         : "mention-1",
              personaCandidateId: null,
              resolvedPersonaId : null,
              resolutionKind    : "MERGE_INTO",
              rationale         : "same named surface"
            }
          },
          {
            candidateRef: "candidate-2",
            draft       : {
              claimFamily       : "IDENTITY_RESOLUTION",
              bookId            : BOOK_ID,
              chapterId         : "chapter-3",
              runId             : RUN_ID,
              source            : "AI",
              reviewState       : "PENDING",
              createdByUserId   : null,
              reviewedByUserId  : null,
              reviewNote        : "STAGE_B: support=KB_ALIAS_EQUIVALENCE; blocks=NONE",
              supersedesClaimId : null,
              derivedFromClaimId: null,
              evidenceSpanIds   : ["evidence-2"],
              confidence        : 0.88,
              mentionId         : "mention-2",
              personaCandidateId: null,
              resolvedPersonaId : null,
              resolutionKind    : "RESOLVES_TO",
              rationale         : "alias canonical"
            }
          }
        ]
      }
    });

    expect(claimRepository.replaceClaimFamilyScope).toHaveBeenCalledWith({
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId  : BOOK_ID,
        runId   : RUN_ID,
        stageKey: STAGE_B_STAGE_KEY
      },
      rows: []
    });
    expect(repository.clearPersonaCandidatesForRun).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      runId : RUN_ID
    });
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(1, {
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: "chapter-1",
        runId    : RUN_ID,
        stageKey : STAGE_B_STAGE_KEY
      },
      drafts: [
        expect.objectContaining({
          mentionId         : "mention-1",
          personaCandidateId: "candidate-db-1"
        })
      ]
    });
    expect(claimWriteService.writeClaimBatch).toHaveBeenNthCalledWith(2, {
      family: "IDENTITY_RESOLUTION",
      scope : {
        bookId   : BOOK_ID,
        chapterId: "chapter-3",
        runId    : RUN_ID,
        stageKey : STAGE_B_STAGE_KEY
      },
      drafts: [
        expect.objectContaining({
          mentionId         : "mention-2",
          personaCandidateId: "candidate-db-2"
        })
      ]
    });
    expect(result).toEqual({
      persistedCounts: {
        personaCandidates       : 2,
        identityResolutionClaims: 2
      }
    });
  });

  it("still clears stale run data when there are no new outputs", async () => {
    const repository = {
      transaction                 : vi.fn(async (work: (tx: typeof repository) => Promise<unknown>) => await work(repository)),
      clearPersonaCandidatesForRun: vi.fn().mockResolvedValue(undefined),
      createPersonaCandidate      : vi.fn()
    };
    const claimRepository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 0 })
    };
    const claimWriteService = {
      writeClaimBatch: vi.fn()
    };
    const persister = createStageBPersister({
      repository       : repository as never,
      claimRepository  : claimRepository as never,
      claimWriteService: claimWriteService as never
    });

    const result = await persister.persistResolutionBundle({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates       : [],
        identityResolutionDrafts: []
      }
    });

    expect(repository.createPersonaCandidate).not.toHaveBeenCalled();
    expect(claimWriteService.writeClaimBatch).not.toHaveBeenCalled();
    expect(result.persistedCounts.identityResolutionClaims).toBe(0);
  });

  it("throws when a draft references an unmapped candidate ref", async () => {
    const repository = {
      transaction                 : vi.fn(async (work: (tx: typeof repository) => Promise<unknown>) => await work(repository)),
      clearPersonaCandidatesForRun: vi.fn().mockResolvedValue(undefined),
      createPersonaCandidate      : vi.fn().mockResolvedValue({ id: "candidate-db-1" })
    };
    const claimRepository = {
      replaceClaimFamilyScope: vi.fn().mockResolvedValue({ deletedCount: 0, createdCount: 0 })
    };
    const claimWriteService = {
      writeClaimBatch: vi.fn()
    };
    const persister = createStageBPersister({
      repository       : repository as never,
      claimRepository  : claimRepository as never,
      claimWriteService: claimWriteService as never
    });

    await expect(persister.persistResolutionBundle({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates: [
          {
            candidateRef      : "candidate-1",
            canonicalLabel    : "范进",
            candidateStatus   : "OPEN",
            firstSeenChapterNo: 1,
            lastSeenChapterNo : 1,
            mentionCount      : 1,
            evidenceScore     : 0.88
          }
        ],
        identityResolutionDrafts: [
          {
            candidateRef: "candidate-404",
            draft       : {
              claimFamily       : "IDENTITY_RESOLUTION",
              bookId            : BOOK_ID,
              chapterId         : "chapter-1",
              runId             : RUN_ID,
              source            : "AI",
              reviewState       : "PENDING",
              createdByUserId   : null,
              reviewedByUserId  : null,
              reviewNote        : "STAGE_B: support=EXACT_NAMED_SURFACE; blocks=NONE",
              supersedesClaimId : null,
              derivedFromClaimId: null,
              evidenceSpanIds   : ["evidence-1"],
              confidence        : 0.74,
              mentionId         : "mention-1",
              personaCandidateId: null,
              resolvedPersonaId : null,
              resolutionKind    : "MERGE_INTO",
              rationale         : "same named surface"
            }
          }
        ]
      }
    })).rejects.toThrowError("Missing persona candidate id for candidateRef=candidate-404");

    expect(claimWriteService.writeClaimBatch).not.toHaveBeenCalled();
  });
});
