import { describe, expect, it, vi } from "vitest";

import type { Stage0SegmentDraft } from "@/server/modules/analysis/pipelines/evidence-review/stage0/types";
import {
  createStage0SegmentRepository,
  type Stage0SegmentRepositoryClient
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";

const BOOK_ID = "11111111-1111-4111-8111-111111111111";
const CHAPTER_ID = "22222222-2222-4222-8222-222222222222";
const RUN_ID = "33333333-3333-4333-8333-333333333333";

function draft(overrides: Partial<Stage0SegmentDraft> = {}): Stage0SegmentDraft {
  return {
    bookId        : BOOK_ID,
    chapterId     : CHAPTER_ID,
    runId         : RUN_ID,
    segmentIndex  : 0,
    segmentType   : "NARRATIVE",
    startOffset   : 0,
    endOffset     : 5,
    rawText       : "王冕读书。",
    normalizedText: "王冕读书。",
    confidence    : 0.95,
    speakerHint   : null,
    ...overrides
  };
}

function createClient() {
  const chapterSegment = {
    deleteMany: vi.fn().mockResolvedValue({ count: 1 }),
    createMany: vi.fn().mockResolvedValue({ count: 2 }),
    findMany  : vi.fn().mockResolvedValue([])
  };

  const client: Stage0SegmentRepositoryClient = { chapterSegment };
  return { client, chapterSegment };
}

describe("Stage0SegmentRepository", () => {
  it("replaces chapter segments by run and chapter before creating new rows", async () => {
    const { client, chapterSegment } = createClient();
    const repository = createStage0SegmentRepository(client);

    await expect(
      repository.replaceChapterSegmentsForRun({
        runId    : RUN_ID,
        chapterId: CHAPTER_ID,
        segments : [
          draft(),
          draft({
            segmentIndex  : 1,
            segmentType   : "DIALOGUE_CONTENT",
            startOffset   : 5,
            endOffset     : 12,
            rawText       : "“明日再谈。”",
            normalizedText: "“明日再谈。”",
            speakerHint   : "王冕"
          })
        ]
      })
    ).resolves.toEqual({ deletedCount: 1, createdCount: 2 });

    expect(chapterSegment.deleteMany).toHaveBeenCalledWith({
      where: {
        runId    : RUN_ID,
        chapterId: CHAPTER_ID
      }
    });
    expect(chapterSegment.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          text       : "王冕读书。",
          confidence : 0.95,
          speakerHint: null
        }),
        expect.objectContaining({
          text       : "“明日再谈。”",
          segmentType: "DIALOGUE_CONTENT",
          speakerHint: "王冕"
        })
      ],
      skipDuplicates: false
    });
  });

  it("does not call createMany when replacement has no segments", async () => {
    const { client, chapterSegment } = createClient();
    const repository = createStage0SegmentRepository(client);

    await expect(
      repository.replaceChapterSegmentsForRun({
        runId    : RUN_ID,
        chapterId: CHAPTER_ID,
        segments : []
      })
    ).resolves.toEqual({ deletedCount: 1, createdCount: 0 });

    expect(chapterSegment.createMany).not.toHaveBeenCalled();
  });

  it("lists segments ordered by segment index and maps Prisma text back to rawText", async () => {
    const { client, chapterSegment } = createClient();
    chapterSegment.findMany.mockResolvedValueOnce([
      {
        bookId        : BOOK_ID,
        chapterId     : CHAPTER_ID,
        runId         : RUN_ID,
        segmentIndex  : 0,
        segmentType   : "NARRATIVE",
        startOffset   : 0,
        endOffset     : 5,
        text          : "王冕读书。",
        normalizedText: "王冕读书。",
        confidence    : 0.95,
        speakerHint   : null
      }
    ]);
    const repository = createStage0SegmentRepository(client);

    await expect(
      repository.listChapterSegments({
        runId    : RUN_ID,
        chapterId: CHAPTER_ID
      })
    ).resolves.toEqual([
      expect.objectContaining({
        rawText     : "王冕读书。",
        segmentIndex: 0
      })
    ]);

    expect(chapterSegment.findMany).toHaveBeenCalledWith({
      where: {
        runId    : RUN_ID,
        chapterId: CHAPTER_ID
      },
      orderBy: { segmentIndex: "asc" }
    });
  });
});
