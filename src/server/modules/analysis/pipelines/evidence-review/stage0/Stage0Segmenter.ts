import { createHash } from "node:crypto";

import {
  createStage0SegmentRepository,
  type Stage0SegmentRepository
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";
import { segmentChapterText } from "@/server/modules/analysis/pipelines/evidence-review/stage0/segment-rules";
import type {
  Stage0SegmentRunInput,
  Stage0SegmentRunResult
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";
import {
  analysisStageRunService,
  type AnalysisStageRunService
} from "@/server/modules/analysis/runs/stage-run-service";

export const STAGE0_STAGE_KEY = "STAGE_0";

export interface Stage0SegmenterDependencies {
  repository?: Stage0SegmentRepository;
  stageRunService?: AnalysisStageRunService;
}

function stableHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function chapterBounds(input: Stage0SegmentRunInput): {
  chapterId: string | null;
  chapterStartNo: number | null;
  chapterEndNo: number | null;
} {
  if (input.chapters.length === 1) {
    return {
      chapterId: input.chapters[0].id,
      chapterStartNo: input.chapters[0].no,
      chapterEndNo: input.chapters[0].no
    };
  }

  if (input.chapters.length === 0) {
    return {
      chapterId: null,
      chapterStartNo: null,
      chapterEndNo: null
    };
  }

  return {
    chapterId: null,
    chapterStartNo: Math.min(...input.chapters.map((chapter) => chapter.no)),
    chapterEndNo: Math.max(...input.chapters.map((chapter) => chapter.no))
  };
}

export function createStage0Segmenter(dependencies: Stage0SegmenterDependencies = {}) {
  const repository = dependencies.repository ?? createStage0SegmentRepository();
  const stageRunService = dependencies.stageRunService ?? analysisStageRunService;

  async function runStage0ForChapters(
    input: Stage0SegmentRunInput
  ): Promise<Stage0SegmentRunResult> {
    if (input.chapters.length === 0) {
      return {
        bookId: input.bookId,
        runId: input.runId,
        stageRunId: null,
        inputCount: 0,
        outputCount: 0,
        skippedCount: 0,
        chapterResults: []
      };
    }

    const bounds = chapterBounds(input);
    const inputHash = stableHash(
      input.chapters.map((chapter) => ({
        id: chapter.id,
        no: chapter.no,
        title: chapter.title,
        content: chapter.content
      }))
    );
    const started = await stageRunService.startStageRun({
      runId: input.runId,
      bookId: input.bookId,
      chapterId: bounds.chapterId,
      stageKey: STAGE0_STAGE_KEY,
      attempt: input.attempt ?? 1,
      inputHash,
      inputCount: input.chapters.length,
      chapterStartNo: bounds.chapterStartNo,
      chapterEndNo: bounds.chapterEndNo
    });

    try {
      const chapterResults = [];
      for (const chapter of input.chapters) {
        if (input.runId === null) {
          throw new Error("Stage 0 persistence requires a non-null runId");
        }

        const result = segmentChapterText({
          bookId: input.bookId,
          runId: input.runId,
          chapter
        });

        await repository.replaceChapterSegmentsForRun({
          runId: input.runId,
          chapterId: chapter.id,
          segments: result.segments
        });

        chapterResults.push(result);
      }

      const outputCount = chapterResults.reduce(
        (sum, result) => sum + result.segments.length,
        0
      );
      await stageRunService.succeedStageRun(started.id, {
        outputHash: stableHash(
          chapterResults.map((result) => ({
            chapterId: result.chapterId,
            segmentCount: result.segments.length,
            confidence: result.confidence,
            unknownRatio: result.unknownRatio
          }))
        ),
        outputCount,
        skippedCount: 0
      });

      return {
        bookId: input.bookId,
        runId: input.runId,
        stageRunId: started.id,
        inputCount: input.chapters.length,
        outputCount,
        skippedCount: 0,
        chapterResults
      };
    } catch (error) {
      await stageRunService.failStageRun(started.id, error);
      throw error;
    }
  }

  async function runStage0ForChapter(input: {
    bookId: string;
    runId: string | null;
    attempt?: number;
    chapter: Stage0SegmentRunInput["chapters"][number];
  }): Promise<Stage0SegmentRunResult> {
    return runStage0ForChapters({
      bookId: input.bookId,
      runId: input.runId,
      attempt: input.attempt,
      chapters: [input.chapter]
    });
  }

  return {
    runStage0ForChapters,
    runStage0ForChapter
  };
}

export type Stage0Segmenter = ReturnType<typeof createStage0Segmenter>;

export const stage0Segmenter = createStage0Segmenter();
