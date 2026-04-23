import { AnalysisJobStatus, AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createEvidenceReviewRerunRepository } from "@/server/modules/analysis/pipelines/evidence-review/rerun-planner/repository";

function createRepositoryClientMock() {
  return {
    chapter: {
      findMany: vi.fn()
    },
    analysisRun: {
      findFirst: vi.fn()
    },
    analysisStageRun: {
      findMany: vi.fn()
    }
  };
}

describe("evidence review rerun repository", () => {
  it("loads chapter metadata by chapter ids and returns chapter number summaries", async () => {
    const client = createRepositoryClientMock();
    client.chapter.findMany.mockResolvedValue([
      { id: "chapter-2", no: 2 },
      { id: "chapter-1", no: 1 }
    ]);
    const repository = createEvidenceReviewRerunRepository(client as never);

    const chapters = await repository.listChapterMetadata(["chapter-2", "chapter-1"]);

    expect(client.chapter.findMany).toHaveBeenCalledWith({
      where : { id: { in: ["chapter-2", "chapter-1"] } },
      select: {
        id: true,
        no: true
      },
      orderBy: [
        { no: "asc" },
        { id: "asc" }
      ]
    });
    expect(chapters).toEqual([
      { chapterId: "chapter-1", chapterNo: 1 },
      { chapterId: "chapter-2", chapterNo: 2 }
    ]);
  });

  it("loads the latest successful run for a book", async () => {
    const client = createRepositoryClientMock();
    const finishedAt = new Date("2026-04-23T10:00:00.000Z");
    const createdAt = new Date("2026-04-23T09:50:00.000Z");
    client.analysisRun.findFirst.mockResolvedValue({
      id                 : "run-9",
      bookId             : "book-1",
      trigger            : "RETRY_STAGE",
      scope              : "chapter:1",
      promptTokens       : 120,
      completionTokens   : 80,
      totalTokens        : 200,
      estimatedCostMicros: BigInt(1234),
      finishedAt,
      createdAt
    });
    const repository = createEvidenceReviewRerunRepository(client as never);

    const run = await repository.findLatestSuccessfulRun("book-1");

    expect(client.analysisRun.findFirst).toHaveBeenCalledWith({
      where: {
        bookId: "book-1",
        status: AnalysisJobStatus.SUCCEEDED
      },
      orderBy: [
        { finishedAt: "desc" },
        { createdAt: "desc" }
      ],
      select: {
        id                 : true,
        bookId             : true,
        trigger            : true,
        scope              : true,
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true,
        finishedAt         : true,
        createdAt          : true
      }
    });
    expect(run).toEqual({
      runId              : "run-9",
      bookId             : "book-1",
      trigger            : "RETRY_STAGE",
      scope              : "chapter:1",
      promptTokens       : 120,
      completionTokens   : 80,
      totalTokens        : 200,
      estimatedCostMicros: BigInt(1234),
      finishedAt,
      createdAt
    });
  });

  it("loads latest successful stage runs and normalizes them back to control-plane stage keys", async () => {
    const client = createRepositoryClientMock();
    const createdAt = new Date("2026-04-23T09:00:00.000Z");
    client.analysisStageRun.findMany.mockResolvedValue([
      {
        stageKey           : "stage_a_extraction",
        inputHash          : "input-a-new",
        outputHash         : "output-a-new",
        chapterStartNo     : 1,
        chapterEndNo       : 2,
        skippedCount       : 0,
        promptTokens       : 10,
        completionTokens   : 5,
        totalTokens        : 15,
        estimatedCostMicros: BigInt(111),
        attempt            : 2,
        startedAt          : createdAt,
        finishedAt         : createdAt,
        createdAt
      },
      {
        stageKey           : "stage_a_extraction",
        inputHash          : "input-a-old",
        outputHash         : "output-a-old",
        chapterStartNo     : 1,
        chapterEndNo       : 2,
        skippedCount       : 1,
        promptTokens       : 9,
        completionTokens   : 4,
        totalTokens        : 13,
        estimatedCostMicros: BigInt(100),
        attempt            : 1,
        startedAt          : createdAt,
        finishedAt         : createdAt,
        createdAt          : new Date("2026-04-23T08:00:00.000Z")
      },
      {
        stageKey           : "stage_c_fact_attribution",
        inputHash          : "input-c",
        outputHash         : "output-c",
        chapterStartNo     : 1,
        chapterEndNo       : 20,
        skippedCount       : 3,
        promptTokens       : 0,
        completionTokens   : 0,
        totalTokens        : 0,
        estimatedCostMicros: BigInt(0),
        attempt            : 1,
        startedAt          : null,
        finishedAt         : null,
        createdAt
      }
    ]);
    const repository = createEvidenceReviewRerunRepository(client as never);

    const stageRuns = await repository.listLatestSuccessfulStageRuns("run-5", [
      "STAGE_A",
      "STAGE_C",
      "STAGE_D"
    ]);

    expect(client.analysisStageRun.findMany).toHaveBeenCalledWith({
      where: {
        runId   : "run-5",
        status  : AnalysisStageRunStatus.SUCCEEDED,
        stageKey: {
          in: [
            "stage_a_extraction",
            "stage_c_fact_attribution"
          ]
        }
      },
      orderBy: [
        { stageKey: "asc" },
        { createdAt: "desc" },
        { attempt: "desc" }
      ],
      select: {
        stageKey           : true,
        inputHash          : true,
        outputHash         : true,
        chapterStartNo     : true,
        chapterEndNo       : true,
        skippedCount       : true,
        promptTokens       : true,
        completionTokens   : true,
        totalTokens        : true,
        estimatedCostMicros: true,
        attempt            : true,
        startedAt          : true,
        finishedAt         : true,
        createdAt          : true
      }
    });
    expect(stageRuns).toEqual([
      {
        stageKey           : "STAGE_A",
        databaseStageKey   : "stage_a_extraction",
        inputHash          : "input-a-new",
        outputHash         : "output-a-new",
        chapterStartNo     : 1,
        chapterEndNo       : 2,
        skippedCount       : 0,
        promptTokens       : 10,
        completionTokens   : 5,
        totalTokens        : 15,
        estimatedCostMicros: BigInt(111),
        attempt            : 2,
        startedAt          : createdAt,
        finishedAt         : createdAt,
        createdAt
      },
      {
        stageKey           : "STAGE_C",
        databaseStageKey   : "stage_c_fact_attribution",
        inputHash          : "input-c",
        outputHash         : "output-c",
        chapterStartNo     : 1,
        chapterEndNo       : 20,
        skippedCount       : 3,
        promptTokens       : 0,
        completionTokens   : 0,
        totalTokens        : 0,
        estimatedCostMicros: BigInt(0),
        attempt            : 1,
        startedAt          : null,
        finishedAt         : null,
        createdAt
      }
    ]);
  });

  it("returns empty/null results when lightweight delegates are missing", async () => {
    const repository = createEvidenceReviewRerunRepository({} as never);

    await expect(repository.listChapterMetadata(["chapter-1"])).resolves.toEqual([]);
    await expect(repository.findLatestSuccessfulRun("book-1")).resolves.toBeNull();
    await expect(
      repository.listLatestSuccessfulStageRuns("run-1", ["STAGE_A", "STAGE_D"])
    ).resolves.toEqual([]);
  });
});
