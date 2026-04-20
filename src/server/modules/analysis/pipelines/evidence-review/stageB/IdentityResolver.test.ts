import { describe, expect, it, vi } from "vitest";

import { createIdentityResolver } from "@/server/modules/analysis/pipelines/evidence-review/stageB/IdentityResolver";
import {
  STAGE_B_RULE_MODEL,
  STAGE_B_RULE_PROVIDER,
  STAGE_B_STAGE_KEY
} from "@/server/modules/analysis/pipelines/evidence-review/stageB/types";

const BOOK_ID = "11111111-1111-1111-1111-111111111111";
const RUN_ID = "22222222-2222-2222-2222-222222222222";

describe("createIdentityResolver", () => {
  it("runs the whole-book resolver and records a cost-free stage run", async () => {
    const repository = {
      listStageBMentions: vi.fn().mockResolvedValue([
        {
          id                 : "33333333-3333-4333-8333-333333333333",
          bookId             : BOOK_ID,
          chapterId          : "44444444-4444-4444-8444-444444444444",
          chapterNo          : 1,
          runId              : RUN_ID,
          surfaceText        : "范进",
          mentionKind        : "NAMED",
          identityClaim      : "SELF",
          aliasTypeHint      : null,
          suspectedResolvesTo: null,
          evidenceSpanId     : "55555555-5555-4555-8555-555555555555",
          confidence         : 0.91,
          source             : "AI"
        }
      ]),
      listStageBAliasClaims: vi.fn().mockResolvedValue([])
    };
    const persister = {
      persistResolutionBundle: vi.fn().mockResolvedValue({
        persistedCounts: {
          personaCandidates       : 1,
          identityResolutionClaims: 1
        }
      })
    };
    const stageRunService = {
      startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
      succeedStageRun: vi.fn().mockResolvedValue(undefined),
      failStageRun   : vi.fn().mockResolvedValue(undefined)
    };

    const resolver = createIdentityResolver({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await resolver.runForBook({
      bookId: BOOK_ID,
      runId : RUN_ID
    });

    expect(stageRunService.startStageRun).toHaveBeenCalledWith(expect.objectContaining({
      bookId    : BOOK_ID,
      runId     : RUN_ID,
      stageKey  : STAGE_B_STAGE_KEY,
      inputCount: 1
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider           : STAGE_B_RULE_PROVIDER,
      model              : STAGE_B_RULE_MODEL,
      promptTokens       : 0,
      completionTokens   : 0,
      estimatedCostMicros: BigInt(0)
    }));
    expect(result).toEqual(expect.objectContaining({
      bookId        : BOOK_ID,
      runId         : RUN_ID,
      stageRunId    : "stage-run-1",
      rawOutputId   : "raw-output-1",
      candidateCount: 1
    }));
  });

  it("still clears and succeeds when the run has no mentions", async () => {
    const repository = {
      listStageBMentions   : vi.fn().mockResolvedValue([]),
      listStageBAliasClaims: vi.fn().mockResolvedValue([])
    };
    const persister = {
      persistResolutionBundle: vi.fn().mockResolvedValue({
        persistedCounts: {
          personaCandidates       : 0,
          identityResolutionClaims: 0
        }
      })
    };
    const stageRunService = {
      startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" }),
      succeedStageRun: vi.fn().mockResolvedValue(undefined),
      failStageRun   : vi.fn().mockResolvedValue(undefined)
    };

    const resolver = createIdentityResolver({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    const result = await resolver.runForBook({
      bookId: BOOK_ID,
      runId : RUN_ID
    });

    expect(persister.persistResolutionBundle).toHaveBeenCalledWith({
      bookId: BOOK_ID,
      runId : RUN_ID,
      bundle: {
        personaCandidates       : [],
        identityResolutionDrafts: []
      }
    });
    expect(result.outputCount).toBe(0);
  });

  it("marks the stage run failed when persistence throws", async () => {
    const repository = {
      listStageBMentions   : vi.fn().mockResolvedValue([]),
      listStageBAliasClaims: vi.fn().mockResolvedValue([])
    };
    const persister = {
      persistResolutionBundle: vi.fn().mockRejectedValue(new Error("persist failed"))
    };
    const stageRunService = {
      startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      recordRawOutput: vi.fn(),
      succeedStageRun: vi.fn(),
      failStageRun   : vi.fn().mockResolvedValue(undefined)
    };

    const resolver = createIdentityResolver({
      repository     : repository as never,
      persister      : persister as never,
      stageRunService: stageRunService as never
    });

    await expect(resolver.runForBook({
      bookId: BOOK_ID,
      runId : RUN_ID
    })).rejects.toThrow("persist failed");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
  });
});
