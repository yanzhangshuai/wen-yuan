import type { ChapterSegmentType } from "@/generated/prisma/enums";
import { prisma } from "@/server/db/prisma";
import type { Stage0SegmentDraft } from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";

interface ChapterSegmentCreateManyDelegate {
  deleteMany(args: {
    where: { runId: string; chapterId: string };
  }): Promise<{ count: number }>;
  createMany(args: {
    data: Array<{
      bookId: string;
      chapterId: string;
      runId: string;
      segmentIndex: number;
      segmentType: ChapterSegmentType;
      startOffset: number;
      endOffset: number;
      text: string;
      normalizedText: string;
      confidence: number;
      speakerHint: string | null;
    }>;
    skipDuplicates: false;
  }): Promise<{ count: number }>;
  findMany(args: {
    where: { runId: string; chapterId: string };
    orderBy: { segmentIndex: "asc" };
  }): Promise<
    Array<{
      bookId: string;
      chapterId: string;
      runId: string;
      segmentIndex: number;
      segmentType: ChapterSegmentType;
      startOffset: number;
      endOffset: number;
      text: string;
      normalizedText: string;
      confidence: number;
      speakerHint: string | null;
    }>
  >;
}

export interface Stage0SegmentRepositoryClient {
  chapterSegment: ChapterSegmentCreateManyDelegate;
}

export interface ReplaceChapterSegmentsInput {
  runId: string;
  chapterId: string;
  segments: Stage0SegmentDraft[];
}

export interface ReplaceChapterSegmentsResult {
  deletedCount: number;
  createdCount: number;
}

export interface ListChapterSegmentsInput {
  runId: string;
  chapterId: string;
}

function toCreateRow(segment: Stage0SegmentDraft) {
  return {
    bookId: segment.bookId,
    chapterId: segment.chapterId,
    runId: segment.runId,
    segmentIndex: segment.segmentIndex,
    segmentType: segment.segmentType as ChapterSegmentType,
    startOffset: segment.startOffset,
    endOffset: segment.endOffset,
    text: segment.rawText,
    normalizedText: segment.normalizedText,
    confidence: segment.confidence,
    speakerHint: segment.speakerHint
  };
}

function toSegmentDraft(
  row: Awaited<ReturnType<ChapterSegmentCreateManyDelegate["findMany"]>>[number]
): Stage0SegmentDraft {
  return {
    bookId: row.bookId,
    chapterId: row.chapterId,
    runId: row.runId,
    segmentIndex: row.segmentIndex,
    segmentType: row.segmentType,
    startOffset: row.startOffset,
    endOffset: row.endOffset,
    rawText: row.text,
    normalizedText: row.normalizedText,
    confidence: row.confidence,
    speakerHint: row.speakerHint
  };
}

export function createStage0SegmentRepository(
  client: Stage0SegmentRepositoryClient = prisma
) {
  async function replaceChapterSegmentsForRun(
    input: ReplaceChapterSegmentsInput
  ): Promise<ReplaceChapterSegmentsResult> {
    const deleted = await client.chapterSegment.deleteMany({
      where: {
        runId: input.runId,
        chapterId: input.chapterId
      }
    });

    if (input.segments.length === 0) {
      return {
        deletedCount: deleted.count,
        createdCount: 0
      };
    }

    const created = await client.chapterSegment.createMany({
      data: input.segments.map(toCreateRow),
      skipDuplicates: false
    });

    return {
      deletedCount: deleted.count,
      createdCount: created.count
    };
  }

  async function listChapterSegments(
    input: ListChapterSegmentsInput
  ): Promise<Stage0SegmentDraft[]> {
    const rows = await client.chapterSegment.findMany({
      where: {
        runId: input.runId,
        chapterId: input.chapterId
      },
      orderBy: { segmentIndex: "asc" }
    });

    return rows.map(toSegmentDraft);
  }

  return {
    replaceChapterSegmentsForRun,
    listChapterSegments
  };
}

export type Stage0SegmentRepository = ReturnType<typeof createStage0SegmentRepository>;

export const stage0SegmentRepository = createStage0SegmentRepository();
