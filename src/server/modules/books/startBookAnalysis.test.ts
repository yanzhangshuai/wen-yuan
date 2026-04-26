/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务输入校验、分支处理与输出映射契约。
 * - 该层通常是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 降低重构时误改核心规则的风险。
 */

import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import {
  AnalysisScopeInvalidError,
  BookNotFoundError,
  createStartBookAnalysisService
} from "@/server/modules/books/startBookAnalysis";

function createMockPrisma() {
  const bookFindFirst = vi.fn();
  const bookUpdate = vi.fn();
  const analysisJobFindFirst = vi.fn().mockResolvedValue(null);
  const tx = {
    analysisJob        : { create: vi.fn() },
    modelStrategyConfig: { create: vi.fn() },
    book               : { update: bookUpdate }
  };

  const prisma = {
    book               : { findFirst: bookFindFirst, update: bookUpdate },
    chapter            : { count: vi.fn() },
    $transaction       : vi.fn(async (callback: (input: typeof tx) => Promise<unknown>) => callback(tx)),
    analysisJob        : { create: tx.analysisJob.create, findFirst: analysisJobFindFirst },
    modelStrategyConfig: tx.modelStrategyConfig
  };

  return { prisma, tx, analysisJobFindFirst };
}

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("startBookAnalysis", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates analysis job and updates book processing status", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(12);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-1",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1");

    expect(prisma.book.findFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: { id: true }
    });
    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        bookId          : "book-1",
        architecture    : "threestage",
        scope           : "FULL_BOOK",
        chapterIndices  : [],
        overrideStrategy: "DRAFT_ONLY",
        keepHistory     : false
      })
    }));
    expect(tx.modelStrategyConfig.create).not.toHaveBeenCalled();
    expect(tx.book.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "book-1" },
      data : expect.objectContaining({
        status       : "PROCESSING",
        parseProgress: 0,
        parseStage   : "文本清洗"
      })
    }));
    expect(result).toEqual({
      bookId          : "book-1",
      jobId           : "job-1",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "threestage",
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false,
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("writes job-level strategy when modelStrategy is provided", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(12);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-2",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "threestage",
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    await service.startBookAnalysis("book-1", {
      architecture : "threestage",
      modelStrategy: {
        CHUNK_EXTRACTION: {
          modelId    : "00000000-0000-0000-0000-000000000001",
          temperature: 0.2
        }
      }
    });

    expect(tx.modelStrategyConfig.create).toHaveBeenCalledWith({
      data: {
        scope : "JOB",
        jobId : "job-2",
        stages: {
          CHUNK_EXTRACTION: {
            modelId    : "00000000-0000-0000-0000-000000000001",
            temperature: 0.2
          }
        }
      }
    });
    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ architecture: "threestage" })
    }));
  });

  it("inherits the latest job architecture when the request omits it", async () => {
    const { prisma, tx, analysisJobFindFirst } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(12);
    analysisJobFindFirst.mockResolvedValue({ architecture: "threestage" });
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-latest-arch",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "threestage",
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1");

    expect(analysisJobFindFirst).toHaveBeenCalledWith({
      where  : { bookId: "book-1" },
      orderBy: { createdAt: "desc" },
      select : { architecture: true }
    });
    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ architecture: "threestage" })
    }));
    expect(result.architecture).toBe("threestage");
  });

  it("explicit threestage architecture is preserved and skips prior-job inheritance query", async () => {
    const { prisma, tx, analysisJobFindFirst } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(5);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-explicit-threestage",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "threestage",
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1", { architecture: "threestage" });

    // 显式传入架构时不查询历史任务
    expect(analysisJobFindFirst).not.toHaveBeenCalled();
    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ architecture: "threestage" })
    }));
    expect(result.architecture).toBe("threestage");
  });

  it("explicit sequential architecture is preserved and skips prior-job inheritance query", async () => {
    const { prisma, tx, analysisJobFindFirst } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(5);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-explicit-sequential",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "sequential",
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1", { architecture: "sequential" });

    // 显式传入架构时不查询历史任务
    expect(analysisJobFindFirst).not.toHaveBeenCalled();
    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ architecture: "sequential" })
    }));
    expect(result.architecture).toBe("sequential");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws BookNotFoundError when book does not exist", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue(null);
    const service = createStartBookAnalysisService(prisma as never);
    await expect(service.startBookAnalysis("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws AnalysisScopeInvalidError for invalid chapter range", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", {
        scope       : "CHAPTER_RANGE",
        chapterStart: 20,
        chapterEnd  : 10
      })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws AnalysisScopeInvalidError when no chapters are confirmed", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(0);
    const service = createStartBookAnalysisService(prisma as never);

    await expect(service.startBookAnalysis("book-1")).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates CHAPTER_LIST analysis job with specified chapter indices", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(3);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-3",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "sequential",
      scope           : "CHAPTER_LIST",
      chapterStart    : null,
      chapterEnd      : null,
      chapterIndices  : [1, 3, 5],
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1", {
      scope         : "CHAPTER_LIST",
      chapterIndices: [5, 1, 3]
    });

    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scope         : "CHAPTER_LIST",
        chapterIndices: [1, 3, 5],
        chapterStart  : null,
        chapterEnd    : null
      })
    }));
    expect(result.chapterIndices).toEqual([1, 3, 5]);
    expect(result.scope).toBe("CHAPTER_LIST");
  });

  it("creates CHAPTER_RANGE analysis job with override strategy and keepHistory", async () => {
    const { prisma, tx } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    prisma.chapter.count.mockResolvedValue(3);
    tx.analysisJob.create.mockResolvedValue({
      id              : "job-4",
      status          : AnalysisJobStatus.QUEUED,
      architecture    : "sequential",
      scope           : "CHAPTER_RANGE",
      chapterStart    : 2,
      chapterEnd      : 4,
      chapterIndices  : [],
      overrideStrategy: "ALL_DRAFTS",
      keepHistory     : true
    });
    tx.book.update.mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 0,
      parseStage   : "文本清洗"
    });

    const service = createStartBookAnalysisService(prisma as never);
    const result = await service.startBookAnalysis("book-1", {
      scope           : "CHAPTER_RANGE",
      chapterStart    : 2,
      chapterEnd      : 4,
      overrideStrategy: "ALL_DRAFTS",
      keepHistory     : true
    });

    expect(tx.analysisJob.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        scope           : "CHAPTER_RANGE",
        chapterStart    : 2,
        chapterEnd      : 4,
        chapterIndices  : [],
        overrideStrategy: "ALL_DRAFTS",
        keepHistory     : true
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      scope           : "CHAPTER_RANGE",
      chapterStart    : 2,
      chapterEnd      : 4,
      overrideStrategy: "ALL_DRAFTS",
      keepHistory     : true
    }));
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws AnalysisScopeInvalidError for CHAPTER_LIST with empty indices", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", { scope: "CHAPTER_LIST", chapterIndices: [] })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("throws AnalysisScopeInvalidError for invalid scope and override strategy", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", { scope: "BROKEN_SCOPE" as never })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);

    await expect(
      service.startBookAnalysis("book-1", { overrideStrategy: "BROKEN_STRATEGY" as never })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("throws AnalysisScopeInvalidError for CHAPTER_LIST with invalid indices", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", { scope: "CHAPTER_LIST", chapterIndices: [1.5] })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);

    await expect(
      service.startBookAnalysis("book-1", { scope: "CHAPTER_LIST", chapterIndices: [-1] })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });

  it("throws AnalysisScopeInvalidError for CHAPTER_RANGE with missing or non-integer bounds", async () => {
    const { prisma } = createMockPrisma();
    prisma.book.findFirst.mockResolvedValue({ id: "book-1" });
    const service = createStartBookAnalysisService(prisma as never);

    await expect(
      service.startBookAnalysis("book-1", {
        scope       : "CHAPTER_RANGE",
        chapterStart: 1
      })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);

    await expect(
      service.startBookAnalysis("book-1", {
        scope       : "CHAPTER_RANGE",
        chapterStart: 1,
        chapterEnd  : 2.5
      })
    ).rejects.toBeInstanceOf(AnalysisScopeInvalidError);
  });
});
