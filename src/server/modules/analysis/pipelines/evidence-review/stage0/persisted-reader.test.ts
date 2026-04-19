import { describe, expect, it, vi } from "vitest";

import {
  createStage0SegmentRepository,
  type Stage0SegmentRepositoryClient
} from "@/server/modules/analysis/pipelines/evidence-review/stage0/repository";

function createClient() {
  const chapterSegment = {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
    findMany  : vi.fn().mockResolvedValue([
      {
        id            : "segment-1",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 0,
        segmentType   : "NARRATIVE",
        startOffset   : 0,
        endOffset     : 6,
        text          : "王冕读书。",
        normalizedText: "王冕读书。",
        confidence    : 0.95,
        speakerHint   : null
      },
      {
        id            : "segment-2",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 1,
        segmentType   : "DIALOGUE_CONTENT",
        startOffset   : 6,
        endOffset     : 14,
        text          : "“明日再谈。”",
        normalizedText: "“明日再谈。”",
        confidence    : 0.88,
        speakerHint   : "王冕"
      }
    ])
  };

  const client: Stage0SegmentRepositoryClient = { chapterSegment };
  return { client, chapterSegment };
}

describe("persisted stage0 segment reader", () => {
  it("returns persisted segment ids while preserving Stage 0 draft fields", async () => {
    const { client, chapterSegment } = createClient();
    const repository = createStage0SegmentRepository(client);

    await expect(
      repository.listPersistedChapterSegments({
        runId    : "run-1",
        chapterId: "chapter-1"
      })
    ).resolves.toEqual([
      {
        id            : "segment-1",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 0,
        segmentType   : "NARRATIVE",
        startOffset   : 0,
        endOffset     : 6,
        rawText       : "王冕读书。",
        normalizedText: "王冕读书。",
        confidence    : 0.95,
        speakerHint   : null
      },
      {
        id            : "segment-2",
        bookId        : "book-1",
        chapterId     : "chapter-1",
        runId         : "run-1",
        segmentIndex  : 1,
        segmentType   : "DIALOGUE_CONTENT",
        startOffset   : 6,
        endOffset     : 14,
        rawText       : "“明日再谈。”",
        normalizedText: "“明日再谈。”",
        confidence    : 0.88,
        speakerHint   : "王冕"
      }
    ]);

    expect(chapterSegment.findMany).toHaveBeenCalledWith({
      where: {
        runId    : "run-1",
        chapterId: "chapter-1"
      },
      orderBy: { segmentIndex: "asc" }
    });
  });
});
