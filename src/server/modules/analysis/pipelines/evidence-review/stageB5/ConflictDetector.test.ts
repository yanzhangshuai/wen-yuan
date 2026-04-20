import { describe, expect, it, vi } from "vitest";

import { createConflictDetector } from "@/server/modules/analysis/pipelines/evidence-review/stageB5/ConflictDetector";
import {
  STAGE_B5_RULE_MODEL,
  STAGE_B5_RULE_PROVIDER,
  STAGE_B5_STAGE_KEY
} from "@/server/modules/analysis/pipelines/evidence-review/stageB5/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const CHAPTER_ID_2 = "44444444-4444-4444-8444-444444444444";
const DEATH_CLAIM_ID = "55555555-5555-4555-8555-555555555555";
const LATER_CLAIM_ID = "66666666-6666-4666-8666-666666666666";
const CANDIDATE_ID = "77777777-7777-4777-8777-777777777777";
const EVIDENCE_ID_1 = "88888888-8888-4888-8888-888888888888";
const EVIDENCE_ID_2 = "99999999-9999-4999-8999-999999999999";

function createEmptyPayload() {
  return {
    personaCandidates       : [],
    aliasClaims             : [],
    eventClaims             : [],
    relationClaims          : [],
    timeClaims              : [],
    identityResolutionClaims: []
  };
}

function createStageRunService() {
  return {
    startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun   : vi.fn().mockResolvedValue(undefined)
  };
}

describe("stageB5/ConflictDetector", () => {
  it("runs the whole pipeline and records deterministic raw output", async () => {
    const repository = {
      loadConflictInputs: vi.fn().mockResolvedValue({
        ...createEmptyPayload(),
        eventClaims: [
          {
            id                       : DEATH_CLAIM_ID,
            bookId                   : BOOK_ID,
            chapterId                : CHAPTER_ID_1,
            chapterNo                : 8,
            runId                    : RUN_ID,
            subjectPersonaCandidateId: CANDIDATE_ID,
            objectPersonaCandidateId : null,
            predicate                : "病逝",
            objectText               : null,
            locationText             : null,
            timeHintId               : null,
            eventCategory            : "DEATH",
            narrativeLens            : "SELF",
            evidenceSpanIds          : [EVIDENCE_ID_1],
            confidence               : 0.9,
            reviewState              : "PENDING",
            source                   : "AI",
            derivedFromClaimId       : null,
            reviewNote               : null
          },
          {
            id                       : LATER_CLAIM_ID,
            bookId                   : BOOK_ID,
            chapterId                : CHAPTER_ID_2,
            chapterNo                : 12,
            runId                    : RUN_ID,
            subjectPersonaCandidateId: CANDIDATE_ID,
            objectPersonaCandidateId : null,
            predicate                : "赴宴",
            objectText               : null,
            locationText             : null,
            timeHintId               : null,
            eventCategory            : "EVENT",
            narrativeLens            : "SELF",
            evidenceSpanIds          : [EVIDENCE_ID_2],
            confidence               : 0.7,
            reviewState              : "PENDING",
            source                   : "AI",
            derivedFromClaimId       : null,
            reviewNote               : null
          }
        ]
      })
    };
    const persister = {
      persistConflictDrafts: vi.fn().mockResolvedValue({ createdCount: 1 })
    };
    const stageRunService = createStageRunService();
    const detector = createConflictDetector({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await detector.runForBook({ bookId: BOOK_ID, runId: RUN_ID });

    expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
      bookId        : BOOK_ID,
      runId         : RUN_ID,
      stageKey      : STAGE_B5_STAGE_KEY,
      inputCount    : 2,
      chapterStartNo: 8,
      chapterEndNo  : 12
    }));
    expect(persister.persistConflictDrafts).toHaveBeenCalledWith(expect.objectContaining({
      bookId: BOOK_ID,
      runId : RUN_ID,
      drafts: expect.arrayContaining([
        expect.objectContaining({
          conflictType              : "POST_MORTEM_ACTION",
          relatedPersonaCandidateIds: [CANDIDATE_ID]
        })
      ])
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider           : STAGE_B5_RULE_PROVIDER,
      model              : STAGE_B5_RULE_MODEL,
      promptTokens       : 0,
      completionTokens   : 0,
      estimatedCostMicros: BigInt(0)
    }));
    expect(result).toEqual(expect.objectContaining({
      bookId         : BOOK_ID,
      runId          : RUN_ID,
      stageRunId     : "stage-run-1",
      rawOutputId    : "raw-output-1",
      inputCount     : 2,
      outputCount    : 1,
      decisionSummary: expect.stringContaining("POST_MORTEM_ACTION:1")
    }));
  });

  it("still records a successful empty deterministic run", async () => {
    const repository = {
      loadConflictInputs: vi.fn().mockResolvedValue(createEmptyPayload())
    };
    const persister = {
      persistConflictDrafts: vi.fn().mockResolvedValue({ createdCount: 0 })
    };
    const stageRunService = createStageRunService();
    const detector = createConflictDetector({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await detector.runForBook({ bookId: BOOK_ID, runId: RUN_ID });

    expect(persister.persistConflictDrafts).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      runId : RUN_ID,
      drafts: []
    });
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith("stage-run-1", expect.objectContaining({
      outputCount : 0,
      skippedCount: 0
    }));
    expect(result.outputCount).toBe(0);
  });

  it("marks the stage run as failed when persistence throws", async () => {
    const repository = {
      loadConflictInputs: vi.fn().mockResolvedValue(createEmptyPayload())
    };
    const persister = {
      persistConflictDrafts: vi.fn().mockRejectedValue(new Error("persist failed"))
    };
    const stageRunService = createStageRunService();
    const detector = createConflictDetector({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    await expect(detector.runForBook({ bookId: BOOK_ID, runId: RUN_ID })).rejects.toThrow("persist failed");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
    expect(stageRunService.succeedStageRun).not.toHaveBeenCalled();
  });
});
