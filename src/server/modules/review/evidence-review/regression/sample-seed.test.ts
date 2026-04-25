import { describe, expect, it, vi } from "vitest";

import {
  seedReviewRegressionSamples,
  type ReviewRegressionSampleSeedPrismaClient
} from "./sample-seed";

const NOW = new Date("2026-04-24T08:00:00.000Z");
const RULIN_BOOK_ID = "10000000-0000-4000-8000-000000000001";
const SANGUO_BOOK_ID = "10000000-0000-4000-8000-000000000002";
const CONFLICT_RULIN_BOOK_ID = "10000000-0000-4000-8000-0000000000aa";
const CONFLICT_SANGUO_BOOK_ID = "10000000-0000-4000-8000-0000000000bb";
const RULIN_BASELINE_RUN_ID = "1a000000-0000-4000-8000-000000000001";
const RULIN_CANDIDATE_RUN_ID = "1a000000-0000-4000-8000-000000000002";
const SANGUO_BASELINE_RUN_ID = "2a000000-0000-4000-8000-000000000001";
const SANGUO_CANDIDATE_RUN_ID = "2a000000-0000-4000-8000-000000000002";

function createRepositoryMock() {
  const rebuildProjection = vi.fn(async () => ({
    counts         : { deleted: 0, created: 0 },
    rebuiltFamilies: [],
    skipped        : {
      unmappedPersonaCandidateIds : [],
      ambiguousPersonaCandidateIds: []
    }
  }));

  const txRepository = {
    book: {
      findMany: vi.fn(async (args?: { where?: { title?: string; author?: string | null; deletedAt?: null } }) => {
        const title = args?.where?.title;
        const author = args?.where?.author;
        if (title === "儒林外史" && author === "吴敬梓") {
          return [
            { id: RULIN_BOOK_ID, title, author, deletedAt: null },
            { id: CONFLICT_RULIN_BOOK_ID, title, author, deletedAt: null }
          ];
        }
        if (title === "三国演义" && author === "罗贯中") {
          return [
            { id: SANGUO_BOOK_ID, title, author, deletedAt: null },
            { id: CONFLICT_SANGUO_BOOK_ID, title, author, deletedAt: null }
          ];
        }
        return [];
      }),
      updateMany: vi.fn(async () => ({ count: 1 })),
      upsert    : vi.fn(async (args: { create: { id: string }; update: { id: string } }) => ({
        id: args.create.id ?? args.update.id
      }))
    },
    chapter: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    chapterSegment: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    evidenceSpan: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    personaAlias: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    identityResolutionClaim: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    eventClaim: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    relationClaim: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    timeClaim: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    conflictFlag: {
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    personaCandidate: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    persona: {
      upsert: vi.fn(async (args: { create: { id: string }; update: { id: string } }) => ({
        id: args.create.id ?? args.update.id
      }))
    },
    personaChapterFact: {
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    personaTimeFact: {
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    relationshipEdge: {
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    timelineEvent: {
      deleteMany: vi.fn(async () => ({ count: 0 }))
    },
    analysisRun: {
      upsert: vi.fn(async (args: { create: { id: string }; update: { id: string } }) => ({
        id: args.create.id ?? args.update.id
      }))
    },
    analysisStageRun: {
      deleteMany: vi.fn(async () => ({ count: 0 })),
      createMany: vi.fn(async (args: { data: unknown[] }) => ({ count: args.data.length }))
    },
    rebuildProjection
  };

  const transactionMock = vi.fn(async <T>(callback: (tx: ReviewRegressionSampleSeedPrismaClient) => Promise<T>) =>
    callback(txRepository as unknown as ReviewRegressionSampleSeedPrismaClient));

  const repository = {
    ...txRepository,
    $transaction: transactionMock
  } as ReviewRegressionSampleSeedPrismaClient;

  return { repository, txRepository, rebuildProjection, transactionMock };
}

describe("seedReviewRegressionSamples", () => {
  it("writes deterministic sample books, soft-deletes title-author conflicts, and rebuilds projections", async () => {
    const { repository, txRepository, rebuildProjection, transactionMock } = createRepositoryMock();

    const result = await seedReviewRegressionSamples({
      prismaClient: repository,
      now         : () => NOW
    });

    expect(transactionMock).toHaveBeenCalledTimes(1);
    expect(txRepository.book.findMany).toHaveBeenNthCalledWith(1, {
      where: { title: "儒林外史", author: "吴敬梓", deletedAt: null }
    });
    expect(txRepository.book.findMany).toHaveBeenNthCalledWith(2, {
      where: { title: "三国演义", author: "罗贯中", deletedAt: null }
    });
    expect(txRepository.book.updateMany).toHaveBeenCalledTimes(2);
    expect(txRepository.book.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [CONFLICT_RULIN_BOOK_ID] } },
      data : { deletedAt: NOW }
    });
    expect(txRepository.book.updateMany).toHaveBeenCalledWith({
      where: { id: { in: [CONFLICT_SANGUO_BOOK_ID] } },
      data : { deletedAt: NOW }
    });
    expect(txRepository.chapter.createMany).toHaveBeenCalledTimes(2);
    expect(txRepository.chapter.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ bookId: RULIN_BOOK_ID, no: 3, title: "第三回" }),
        expect.objectContaining({ bookId: RULIN_BOOK_ID, no: 4, title: "第四回" })
      ])
    });
    expect(txRepository.chapter.createMany.mock.calls[1]?.[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ bookId: SANGUO_BOOK_ID, no: 21, title: "第二十一回" }),
        expect.objectContaining({ bookId: SANGUO_BOOK_ID, no: 43, title: "第四十三回" })
      ])
    });
    expect(txRepository.personaAlias.createMany).toHaveBeenCalled();
    expect(txRepository.personaCandidate.createMany).toHaveBeenCalled();
    expect(txRepository.identityResolutionClaim.createMany).toHaveBeenCalled();
    expect(txRepository.eventClaim.createMany).toHaveBeenCalled();
    expect(txRepository.relationClaim.createMany).toHaveBeenCalled();
    expect(txRepository.timeClaim.createMany).toHaveBeenCalled();
    expect(rebuildProjection).toHaveBeenNthCalledWith(1, { kind: "FULL_BOOK", bookId: RULIN_BOOK_ID });
    expect(rebuildProjection).toHaveBeenNthCalledWith(2, { kind: "FULL_BOOK", bookId: SANGUO_BOOK_ID });
    expect(result).toEqual({
      books: [
        {
          bookId        : RULIN_BOOK_ID,
          fixtureKey    : "rulin-waishi-sample",
          baselineRunId : RULIN_BASELINE_RUN_ID,
          candidateRunId: RULIN_CANDIDATE_RUN_ID
        },
        {
          bookId        : SANGUO_BOOK_ID,
          fixtureKey    : "sanguo-yanyi-sample",
          baselineRunId : SANGUO_BASELINE_RUN_ID,
          candidateRunId: SANGUO_CANDIDATE_RUN_ID
        }
      ]
    });
  });

  it("is idempotent and preserves sample book ids when rerun", async () => {
    const { repository, txRepository } = createRepositoryMock();

    await seedReviewRegressionSamples({
      prismaClient: repository,
      now         : () => NOW
    });

    await seedReviewRegressionSamples({
      prismaClient: repository,
      now         : () => NOW
    });

    expect(txRepository.book.upsert).toHaveBeenCalledTimes(4);
    expect(txRepository.book.upsert.mock.calls.every(([args]) => {
      return args.create.id === args.update.id;
    })).toBe(true);
    expect(txRepository.chapter.deleteMany).toHaveBeenCalledTimes(4);
    expect(txRepository.eventClaim.deleteMany).toHaveBeenCalledTimes(4);
  });

  it("seeds baseline and candidate runs so rerun comparison can read run-scoped claims without polluting accepted truth", async () => {
    const { repository, txRepository } = createRepositoryMock();

    const result = await seedReviewRegressionSamples({
      prismaClient: repository,
      now         : () => NOW
    });

    expect(txRepository.analysisRun.upsert).toHaveBeenCalledTimes(4);
    expect(txRepository.analysisStageRun.createMany).toHaveBeenCalledTimes(2);
    expect(txRepository.analysisStageRun.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ runId: RULIN_BASELINE_RUN_ID, stageKey: "stage_a_extraction" }),
        expect.objectContaining({ runId: RULIN_CANDIDATE_RUN_ID, stageKey: "stage_a_extraction" })
      ])
    });
    expect(txRepository.analysisStageRun.createMany.mock.calls[1]?.[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ runId: SANGUO_BASELINE_RUN_ID, stageKey: "stage_a_extraction" }),
        expect.objectContaining({ runId: SANGUO_CANDIDATE_RUN_ID, stageKey: "stage_a_extraction" })
      ])
    });
    expect(txRepository.eventClaim.createMany.mock.calls[0]?.[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ runId: RULIN_BASELINE_RUN_ID, reviewState: "ACCEPTED" }),
        expect.objectContaining({ runId: RULIN_CANDIDATE_RUN_ID, reviewState: "PENDING" })
      ])
    });
    expect(txRepository.relationClaim.createMany.mock.calls[1]?.[0]).toMatchObject({
      data: expect.arrayContaining([
        expect.objectContaining({ runId: SANGUO_BASELINE_RUN_ID, reviewState: "ACCEPTED" }),
        expect.objectContaining({ runId: SANGUO_CANDIDATE_RUN_ID, reviewState: "PENDING" })
      ])
    });
    expect(result).toEqual({
      books: [
        {
          bookId        : RULIN_BOOK_ID,
          fixtureKey    : "rulin-waishi-sample",
          baselineRunId : RULIN_BASELINE_RUN_ID,
          candidateRunId: RULIN_CANDIDATE_RUN_ID
        },
        {
          bookId        : SANGUO_BOOK_ID,
          fixtureKey    : "sanguo-yanyi-sample",
          baselineRunId : SANGUO_BASELINE_RUN_ID,
          candidateRunId: SANGUO_CANDIDATE_RUN_ID
        }
      ]
    });
  });
});
