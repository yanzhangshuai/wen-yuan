import { describe, expect, it, vi } from "vitest";

import { createKnowledgeRecallStage } from "@/server/modules/analysis/pipelines/evidence-review/stageAPlus/KnowledgeRecallStage";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

describe("KnowledgeRecallStage", () => {
  it("runs Stage A+ end to end with cost-free stage metrics", async () => {
    const relationNormalizer = vi.fn().mockReturnValue({
      relationDrafts  : [],
      discardRecords  : [],
      knowledgeItemIds: []
    });
    const stageRunService = {
      startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      succeedStageRun: vi.fn().mockResolvedValue(undefined),
      failStageRun   : vi.fn().mockResolvedValue(undefined),
      recordRawOutput: vi.fn().mockResolvedValue({ id: "raw-output-1" })
    };
    const stage = createKnowledgeRecallStage({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue([
          {
            id            : "segment-1",
            bookId        : BOOK_ID,
            chapterId     : CHAPTER_ID,
            runId         : RUN_ID,
            segmentIndex  : 0,
            segmentType   : "NARRATIVE",
            startOffset   : 0,
            endOffset     : 4,
            rawText       : "范老爷",
            normalizedText: "范老爷",
            confidence    : 0.95,
            speakerHint   : null
          }
        ])
      },
      knowledgeLoader: {
        load: vi.fn().mockResolvedValue({
          scopeChain   : [{ scopeType: "GLOBAL", scopeId: null }],
          verifiedItems: [],
          pendingItems : [],
          byType       : {}
        })
      },
      stageAPlusRepository: {
        listStageARelationClaims: vi.fn().mockResolvedValue([])
      },
      ruleRecall: {
        recallChapterClaims: vi.fn().mockResolvedValue({
          mentionDrafts   : [],
          aliasDrafts     : [],
          relationDrafts  : [],
          discardRecords  : [],
          knowledgeItemIds: []
        })
      },
      relationNormalizer,
      persister: {
        persistStageAPlusClaims: vi.fn().mockResolvedValue({
          persistedCounts : { mentions: 0, aliases: 0, relations: 0 },
          knowledgeItemIds: []
        })
      },
      stageRunService
    });

    const result = await stage.runForChapter({
      bookId     : BOOK_ID,
      bookTypeKey: "CLASSICAL_NOVEL",
      runId      : RUN_ID,
      chapter    : {
        id     : CHAPTER_ID,
        no     : 1,
        title  : "第一回",
        content: "范老爷"
      }
    });

    expect(result.stageRunId).toBe("stage-run-1");
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith("stage-run-1", expect.objectContaining({
      promptTokens       : 0,
      completionTokens   : 0,
      estimatedCostMicros: BigInt(0)
    }));
    expect(stageRunService.recordRawOutput).toHaveBeenCalledWith(expect.objectContaining({
      provider        : "rule-engine",
      model           : "stage-a-plus-knowledge-recall-v1",
      promptTokens    : 0,
      completionTokens: 0
    }));
    expect(relationNormalizer).toHaveBeenCalledWith(expect.objectContaining({
      relationCatalog: expect.objectContaining({
        activeEntries  : expect.any(Array),
        disabledEntries: expect.any(Array)
      })
    }));
  });

  it("fails the stage run when Stage 0 persisted segments are missing", async () => {
    const stageRunService = {
      startStageRun  : vi.fn().mockResolvedValue({ id: "stage-run-1" }),
      succeedStageRun: vi.fn(),
      failStageRun   : vi.fn().mockResolvedValue(undefined),
      recordRawOutput: vi.fn()
    };
    const stage = createKnowledgeRecallStage({
      stage0Repository: {
        listPersistedChapterSegments: vi.fn().mockResolvedValue([])
      },
      knowledgeLoader: {
        load: vi.fn()
      },
      stageAPlusRepository: {
        listStageARelationClaims: vi.fn()
      },
      ruleRecall: {
        recallChapterClaims: vi.fn()
      },
      relationNormalizer: vi.fn(),
      persister         : {
        persistStageAPlusClaims: vi.fn()
      },
      stageRunService
    });

    await expect(stage.runForChapter({
      bookId     : BOOK_ID,
      bookTypeKey: null,
      runId      : RUN_ID,
      chapter    : {
        id     : CHAPTER_ID,
        no     : 1,
        title  : "第一回",
        content: ""
      }
    })).rejects.toThrowError("Stage A+ requires persisted Stage 0 segments");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith("stage-run-1", expect.any(Error));
  });
});
