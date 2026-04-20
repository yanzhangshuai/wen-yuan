import { describe, expect, it, vi } from "vitest";

import { createFactAttributor } from "@/server/modules/analysis/pipelines/evidence-review/stageC/FactAttributor";
import {
  STAGE_C_RULE_MODEL,
  STAGE_C_RULE_PROVIDER,
  STAGE_C_STAGE_KEY,
  type StageCEventClaimRow,
  type StageCPersonaCandidateRow,
  type StageCRepositoryPayload
} from "@/server/modules/analysis/pipelines/evidence-review/stageC/types";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const RUN_ID = "22222222-2222-4222-8222-222222222222";
const CHAPTER_ID_1 = "33333333-3333-4333-8333-333333333333";
const EVENT_ID_1 = "44444444-4444-4444-8444-444444444444";
const CANDIDATE_ID_1 = "55555555-5555-4555-8555-555555555555";
const EVIDENCE_ID_1 = "66666666-6666-4666-8666-666666666666";

function createStageRunService() {
  return {
    startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun   : vi.fn().mockResolvedValue(undefined)
  };
}

function candidate(
  overrides: Partial<StageCPersonaCandidateRow> = {}
): StageCPersonaCandidateRow {
  return {
    id                : CANDIDATE_ID_1,
    bookId            : BOOK_ID,
    runId             : RUN_ID,
    canonicalLabel    : "范进",
    firstSeenChapterNo: 1,
    lastSeenChapterNo : 20,
    mentionCount      : 8,
    evidenceScore     : 0.9,
    ...overrides
  };
}

function eventClaim(overrides: Partial<StageCEventClaimRow> = {}): StageCEventClaimRow {
  return {
    id                       : EVENT_ID_1,
    bookId                   : BOOK_ID,
    chapterId                : CHAPTER_ID_1,
    chapterNo                : 12,
    runId                    : RUN_ID,
    subjectMentionId         : null,
    subjectPersonaCandidateId: CANDIDATE_ID_1,
    predicate                : "中举",
    objectText               : null,
    objectPersonaCandidateId : null,
    locationText             : null,
    timeHintId               : null,
    eventCategory            : "EXAM",
    narrativeLens            : "HISTORICAL",
    evidenceSpanIds          : [EVIDENCE_ID_1],
    confidence               : 0.82,
    reviewState              : "PENDING",
    source                   : "AI",
    derivedFromClaimId       : null,
    reviewNote               : null,
    ...overrides
  };
}

function emptyPayload(): StageCRepositoryPayload {
  return {
    personaCandidates: [],
    eventClaims      : [],
    relationClaims   : [],
    timeClaims       : [],
    conflictFlags    : []
  };
}

function payloadWithOneEvent(): StageCRepositoryPayload {
  return {
    ...emptyPayload(),
    personaCandidates: [candidate()],
    eventClaims      : [eventClaim()]
  };
}

describe("stageC/FactAttributor", () => {
  it("runs Stage C, persists derived facts, and records deterministic raw output", async () => {
    const repository = {
      loadFactAttributionInputs: vi.fn().mockResolvedValue(payloadWithOneEvent())
    };
    const persister = {
      persistFactAttributionDrafts: vi.fn().mockResolvedValue({ createdCount: 1, deletedCount: 0 })
    };
    const stageRunService = createStageRunService();
    const attributor = createFactAttributor({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await attributor.runForBook({ bookId: BOOK_ID, runId: RUN_ID });

    expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
      bookId        : BOOK_ID,
      runId         : RUN_ID,
      stageKey      : STAGE_C_STAGE_KEY,
      inputCount    : 1,
      chapterStartNo: 12,
      chapterEndNo  : 12
    }));
    expect(persister.persistFactAttributionDrafts).toHaveBeenCalledWith(expect.objectContaining({
      bookId          : BOOK_ID,
      runId           : RUN_ID,
      scopedChapterIds: [CHAPTER_ID_1],
      eventDrafts     : [
        expect.objectContaining({
          claimFamily       : "EVENT",
          derivedFromClaimId: EVENT_ID_1,
          reviewState       : "PENDING"
        })
      ],
      relationDrafts: []
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider           : STAGE_C_RULE_PROVIDER,
      model              : STAGE_C_RULE_MODEL,
      promptTokens       : 0,
      completionTokens   : 0,
      estimatedCostMicros: BigInt(0)
    }));
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith("stage-run-1", expect.objectContaining({
      outputCount : 1,
      skippedCount: 0
    }));
    expect(result).toEqual(expect.objectContaining({
      bookId         : BOOK_ID,
      runId          : RUN_ID,
      stageRunId     : "stage-run-1",
      rawOutputId    : "raw-output-1",
      inputCount     : 1,
      outputCount    : 1,
      skippedCount   : 0,
      persistedCounts: { createdCount: 1, deletedCount: 0 },
      decisionSummary: expect.stringContaining("EVENT:1")
    }));
  });

  it("marks the stage run failed when persistence throws", async () => {
    const repository = {
      loadFactAttributionInputs: vi.fn().mockResolvedValue(emptyPayload())
    };
    const persister = {
      persistFactAttributionDrafts: vi.fn().mockRejectedValue(new Error("persist failed"))
    };
    const stageRunService = createStageRunService();
    const attributor = createFactAttributor({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    await expect(attributor.runForBook({ bookId: BOOK_ID, runId: RUN_ID })).rejects.toThrow("persist failed");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
    expect(stageRunService.succeedStageRun).not.toHaveBeenCalled();
  });

  it("requires a non-null runId before loading inputs", async () => {
    const repository = {
      loadFactAttributionInputs: vi.fn()
    };
    const attributor = createFactAttributor({ repository: repository as never });

    await expect(attributor.runForBook({ bookId: BOOK_ID, runId: null })).rejects.toThrow(
      "Stage C persistence requires a non-null runId"
    );

    expect(repository.loadFactAttributionInputs).not.toHaveBeenCalled();
  });
});
