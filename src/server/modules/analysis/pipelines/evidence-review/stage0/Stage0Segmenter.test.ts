import { describe, expect, it, vi } from "vitest";

import { createStage0Segmenter } from "@/server/modules/analysis/pipelines/evidence-review/stage0/Stage0Segmenter";
import type { Stage0SegmentRepository } from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import type { AnalysisStageRunService } from "@/server/modules/analysis/runs/stage-run-service";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function createDeps() {
  const repository: Stage0SegmentRepository = {
    replaceChapterSegmentsForRun: vi
      .fn()
      .mockResolvedValue({ deletedCount: 0, createdCount: 0 }),
    listChapterSegments: vi.fn()
  };

  const stageRunService: AnalysisStageRunService = {
    startStageRun: vi.fn().mockResolvedValue({ id: "stage-run-1" }),
    succeedStageRun: vi.fn().mockResolvedValue(undefined),
    failStageRun: vi.fn().mockResolvedValue(undefined),
    skipStageRun: vi.fn().mockResolvedValue(undefined),
    recordRawOutput: vi.fn().mockResolvedValue({ id: null })
  };

  return { repository, stageRunService };
}

describe("Stage0Segmenter", () => {
  it("segments chapters, persists by chapter, and records a successful stage run", async () => {
    const { repository, stageRunService } = createDeps();
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    const result = await segmenter.runStage0ForChapters({
      bookId: BOOK_ID,
      runId: RUN_ID,
      chapters: [
        {
          id: CHAPTER_ID,
          no: 1,
          title: "第一回 王冕读书",
          content: "第一回 王冕读书\n王冕道：“明日再谈。”"
        }
      ]
    });

    expect(result.stageRunId).toBe("stage-run-1");
    expect(result.inputCount).toBe(1);
    expect(result.outputCount).toBeGreaterThan(0);
    expect(repository.replaceChapterSegmentsForRun).toHaveBeenCalledWith({
      runId: RUN_ID,
      chapterId: CHAPTER_ID,
      segments: expect.arrayContaining([
        expect.objectContaining({ segmentType: "TITLE" }),
        expect.objectContaining({ segmentType: "DIALOGUE_LEAD" }),
        expect.objectContaining({ segmentType: "DIALOGUE_CONTENT" })
      ])
    });
    expect(stageRunService.startStageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        runId: RUN_ID,
        bookId: BOOK_ID,
        stageKey: "STAGE_0",
        inputCount: 1,
        chapterStartNo: 1,
        chapterEndNo: 1
      })
    );
    expect(stageRunService.succeedStageRun).toHaveBeenCalledWith(
      "stage-run-1",
      expect.objectContaining({
        outputCount: result.outputCount,
        skippedCount: 0
      })
    );
  });

  it("supports chapter-level rerun with a single chapter input", async () => {
    const { repository, stageRunService } = createDeps();
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    await segmenter.runStage0ForChapter({
      bookId: BOOK_ID,
      runId: RUN_ID,
      chapter: {
        id: CHAPTER_ID,
        no: 7,
        title: "第七回",
        content: "第七回\n却说王冕后来回家读书。"
      }
    });

    expect(stageRunService.startStageRun).toHaveBeenCalledWith(
      expect.objectContaining({
        chapterId: CHAPTER_ID,
        chapterStartNo: 7,
        chapterEndNo: 7
      })
    );
    expect(repository.replaceChapterSegmentsForRun).toHaveBeenCalledTimes(1);
  });

  it("records failed stage runs and rethrows when persistence fails", async () => {
    const { repository, stageRunService } = createDeps();
    vi.mocked(repository.replaceChapterSegmentsForRun).mockRejectedValueOnce(
      new Error("db down")
    );
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    await expect(
      segmenter.runStage0ForChapters({
        bookId: BOOK_ID,
        runId: RUN_ID,
        chapters: [
          {
            id: CHAPTER_ID,
            no: 1,
            title: "第一回",
            content: "第一回\n王冕读书。"
          }
        ]
      })
    ).rejects.toThrow("db down");

    expect(stageRunService.failStageRun).toHaveBeenCalledWith(
      "stage-run-1",
      expect.any(Error)
    );
    expect(stageRunService.succeedStageRun).not.toHaveBeenCalled();
  });

  it("skips empty chapter arrays without writing segments", async () => {
    const { repository, stageRunService } = createDeps();
    const segmenter = createStage0Segmenter({ repository, stageRunService });

    const result = await segmenter.runStage0ForChapters({
      bookId: BOOK_ID,
      runId: RUN_ID,
      chapters: []
    });

    expect(result).toMatchObject({
      inputCount: 0,
      outputCount: 0,
      skippedCount: 0,
      chapterResults: []
    });
    expect(repository.replaceChapterSegmentsForRun).not.toHaveBeenCalled();
    expect(stageRunService.startStageRun).not.toHaveBeenCalled();
  });
});
