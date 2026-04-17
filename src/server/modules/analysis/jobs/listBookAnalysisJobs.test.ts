/**
 * 文件定位（分析流水线模块单测）：
 * - 覆盖 analysis 域服务/作业/配置解析能力，属于服务端核心业务逻辑层。
 * - 该模块是小说结构化解析的主链路，直接影响人物、关系、生平等下游数据质量。
 *
 * 业务职责：
 * - 验证模型调用策略、提示词拼装、结果归并、异常降级与任务状态流转。
 * - 约束输入归一化与输出契约，避免分析链路重构时出现隐性行为漂移。
 *
 * 维护提示：
 * - 这里的断言大多是业务规则（如状态推进、去重策略、容错路径），不是简单技术实现细节。
 */

import { AnalysisJobStatus } from "@/generated/prisma/enums";
import { describe, expect, it, vi } from "vitest";

import { createListBookAnalysisJobsService } from "@/server/modules/analysis/jobs/listBookAnalysisJobs";
import { BookNotFoundError } from "@/server/modules/books/errors";

const NOW = new Date("2025-03-28T10:00:00.000Z");
const STARTED_AT = new Date("2025-03-28T09:55:00.000Z");
const FINISHED_AT = new Date("2025-03-28T09:58:00.000Z");

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("listBookAnalysisJobs", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns job list for existing book", async () => {
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue({ id: "book-1" });
    const analysisJobFindMany = vi.fn().mockResolvedValue([
      {
        id            : "job-1",
        status        : AnalysisJobStatus.SUCCEEDED,
        architecture  : "sequential",
        scope         : "FULL_BOOK",
        chapterStart  : null,
        chapterEnd    : null,
        chapterIndices: [],
        attempt       : 1,
        errorLog      : null,
        startedAt     : STARTED_AT,
        finishedAt    : FINISHED_AT,
        createdAt     : NOW,
        phaseLogs     : [
          {
            model: { name: "gpt-4o" }
          }
        ]
      },
      {
        id            : "job-2",
        status        : AnalysisJobStatus.FAILED,
        architecture  : "threestage",
        scope         : "CHAPTER_RANGE",
        chapterStart  : 1,
        chapterEnd    : 5,
        chapterIndices: [],
        attempt       : 2,
        errorLog      : "LLM timeout",
        startedAt     : STARTED_AT,
        finishedAt    : null,
        createdAt     : NOW,
        phaseLogs     : []
      }
    ]);

    const service = createListBookAnalysisJobsService({
      book       : { findFirst: bookFindFirst },
      analysisJob: { findMany: analysisJobFindMany }
    } as never);

    // Act
    const result = await service.listBookAnalysisJobs("book-1");

    // Assert
    expect(bookFindFirst).toHaveBeenCalledWith({
      where : { id: "book-1", deletedAt: null },
      select: { id: true }
    });
    expect(analysisJobFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where  : { bookId: "book-1" },
      orderBy: { createdAt: "desc" }
    }));
    expect(result).toHaveLength(2);

    const [first, second] = result;
    expect(first).toMatchObject({
      id          : "job-1",
      status      : AnalysisJobStatus.SUCCEEDED,
      architecture: "sequential",
      scope       : "FULL_BOOK",
      chapterStart: null,
      chapterEnd  : null,
      attempt     : 1,
      errorLog    : null,
      startedAt   : STARTED_AT.toISOString(),
      finishedAt  : FINISHED_AT.toISOString(),
      createdAt   : NOW.toISOString(),
      aiModelName : "gpt-4o"
    });
    expect(second).toMatchObject({
      id          : "job-2",
      status      : AnalysisJobStatus.FAILED,
      architecture: "threestage",
      scope       : "CHAPTER_RANGE",
      chapterStart: 1,
      chapterEnd  : 5,
      attempt     : 2,
      errorLog    : "LLM timeout",
      finishedAt  : null,
      aiModelName : null
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws BookNotFoundError when book does not exist", async () => {
    // Arrange
    const service = createListBookAnalysisJobsService({
      book       : { findFirst: vi.fn().mockResolvedValue(null) },
      analysisJob: { findMany: vi.fn() }
    } as never);

    // Act + Assert
    await expect(service.listBookAnalysisJobs("missing-id")).rejects.toBeInstanceOf(BookNotFoundError);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns empty list when book has no jobs", async () => {
    // Arrange
    const service = createListBookAnalysisJobsService({
      book       : { findFirst: vi.fn().mockResolvedValue({ id: "book-1" }) },
      analysisJob: { findMany: vi.fn().mockResolvedValue([]) }
    } as never);

    // Act
    const result = await service.listBookAnalysisJobs("book-1");

    // Assert
    expect(result).toEqual([]);
  });
});
