import { AnalysisStageRunStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createAnalysisRetryPlanner } from "@/server/modules/analysis/runs/retry-planner";

const hoisted = vi.hoisted(() => ({
  prisma: {
    analysisStageRun: {
      findMany: vi.fn()
    }
  }
}));

vi.mock("@/server/db/prisma", () => ({
  prisma: hoisted.prisma
}));

function createPrismaMock(rows: unknown[] = []) {
  const analysisStageRunFindMany = vi.fn().mockResolvedValue(rows);

  return {
    prisma: {
      analysisStageRun: {
        findMany: analysisStageRunFindMany
      }
    } as never,
    analysisStageRunFindMany
  };
}

describe("analysis retry planner", () => {
  it("plans isolated chapter retry for failed Stage A chapter runs", async () => {
    // Arrange
    const { prisma, analysisStageRunFindMany } = createPrismaMock([
      {
        stageKey      : "STAGE_A",
        chapterId     : "chapter-3",
        attempt       : 1,
        chapterStartNo: 3,
        chapterEndNo  : 3
      }
    ]);
    const planner = createAnalysisRetryPlanner(prisma);

    // Act
    const plan = await planner.planRunRetry("run-1");

    // Assert
    expect(analysisStageRunFindMany).toHaveBeenCalledWith({
      where: {
        runId : "run-1",
        status: AnalysisStageRunStatus.FAILED
      },
      orderBy: [
        { stageKey: "asc" },
        { chapterStartNo: "asc" },
        { createdAt: "asc" }
      ],
      select: {
        stageKey      : true,
        chapterId     : true,
        attempt       : true,
        chapterStartNo: true,
        chapterEndNo  : true
      }
    });
    expect(plan).toEqual({
      retryKind: "CHAPTER",
      runId    : "run-1",
      items    : [
        {
          stageKey               : "STAGE_A",
          chapterId              : "chapter-3",
          chapterStartNo         : 3,
          chapterEndNo           : 3,
          nextAttempt            : 2,
          preservePreviousOutputs: false
        }
      ]
    });
  });

  it("plans stage retry that preserves previous outputs for Stage B and Stage C failures", async () => {
    const { prisma } = createPrismaMock([
      {
        stageKey      : "STAGE_B",
        chapterId     : null,
        attempt       : 2,
        chapterStartNo: 1,
        chapterEndNo  : 20
      },
      {
        stageKey      : "STAGE_C",
        chapterId     : null,
        attempt       : 4,
        chapterStartNo: 1,
        chapterEndNo  : 20
      }
    ]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planRunRetry("run-1");

    expect(plan).toEqual({
      retryKind: "STAGE",
      runId    : "run-1",
      items    : [
        {
          stageKey               : "STAGE_B",
          chapterId              : null,
          chapterStartNo         : 1,
          chapterEndNo           : 20,
          nextAttempt            : 3,
          preservePreviousOutputs: true
        },
        {
          stageKey               : "STAGE_C",
          chapterId              : null,
          chapterStartNo         : 1,
          chapterEndNo           : 20,
          nextAttempt            : 5,
          preservePreviousOutputs: true
        }
      ]
    });
  });

  it("plans projection rebuild without requiring failed stage rows", async () => {
    const { prisma, analysisStageRunFindMany } = createPrismaMock([]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planProjectionRebuild({
      runId : "run-1",
      bookId: "book-1",
      reason: "manual review accepted claims"
    });

    expect(analysisStageRunFindMany).not.toHaveBeenCalled();
    expect(plan).toEqual({
      retryKind: "PROJECTION",
      runId    : "run-1",
      bookId   : "book-1",
      reason   : "manual review accepted claims",
      items    : [
        {
          stageKey               : "STAGE_D",
          chapterId              : null,
          chapterStartNo         : null,
          chapterEndNo           : null,
          nextAttempt            : 1,
          preservePreviousOutputs: true
        }
      ]
    });
  });

  it("returns a no-op plan when there are no failed stages", async () => {
    const { prisma } = createPrismaMock([]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planRunRetry("run-1");

    expect(plan).toEqual({
      retryKind: "NONE",
      runId    : "run-1",
      items    : []
    });
  });

  it("returns a no-op plan when analysisStageRun.findMany delegate is missing", async () => {
    const planner = createAnalysisRetryPlanner({} as never);

    const plan = await planner.planRunRetry("run-1");

    expect(plan).toEqual({
      retryKind: "NONE",
      runId    : "run-1",
      items    : []
    });
  });

  it("falls back to a run retry when a failed stage key is not a known STAGE_* value", async () => {
    const { prisma } = createPrismaMock([
      {
        stageKey      : "INGEST_SOURCE",
        chapterId     : null,
        attempt       : 3,
        chapterStartNo: null,
        chapterEndNo  : null
      }
    ]);
    const planner = createAnalysisRetryPlanner(prisma);

    const plan = await planner.planRunRetry("run-1");

    expect(plan).toEqual({
      retryKind: "RUN",
      runId    : "run-1",
      items    : [
        {
          stageKey               : "INGEST_SOURCE",
          chapterId              : null,
          chapterStartNo         : null,
          chapterEndNo           : null,
          nextAttempt            : 4,
          preservePreviousOutputs: true
        }
      ]
    });
  });
});
