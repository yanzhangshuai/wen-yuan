import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError, createGetBookStatusService } from "@/server/modules/books/getBookStatus";

/**
 * 文件定位（书籍处理状态查询服务单测）：
 * - 面向前端轮询场景（如上传后解析进度页），验证服务返回“状态快照”结构。
 * - 该服务通常被 `app/api/books/[id]/status` 类接口包装后供客户端轮询调用。
 *
 * 业务要点：
 * - 进度、阶段、错误信息、章节状态必须统一返回，便于 UI 一次渲染完整进度面板。
 */
describe("getBookStatus", () => {
  it("returns status snapshot for polling", async () => {
    // 场景：当存在作业级错误时，服务应优先透出最近可读错误，帮助运营快速定位失败原因。
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue({
      status       : "PROCESSING",
      parseProgress: 70,
      parseStage   : "实体提取",
      errorLog     : null,
      analysisJobs : [
        {
          updatedAt: new Date("2026-03-24T10:10:00.000Z"),
          errorLog : "第 9 章解析失败"
        }
      ],
      chapters: [
        { no: 1, type: "CHAPTER", title: "第一回", parseStatus: "SUCCEEDED" },
        { no: 2, type: "CHAPTER", title: "第二回", parseStatus: "PROCESSING" }
      ]
    });
    const analysisJobFindFirst = vi.fn().mockResolvedValue(null);
    const service = createGetBookStatusService({
      book       : { findFirst: bookFindFirst },
      analysisJob: { findFirst: analysisJobFindFirst }
    } as never);

    // Act
    const result = await service.getBookStatus("book-1");

    // Assert
    expect(bookFindFirst).toHaveBeenCalledOnce();
    expect(bookFindFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: expect.objectContaining({
        status       : true,
        parseProgress: true,
        parseStage   : true,
        errorLog     : true,
        chapters     : expect.objectContaining({ select: expect.objectContaining({ type: true, parseStatus: true }) })
      })
    });
    expect(analysisJobFindFirst).toHaveBeenCalledWith({
      where: {
        bookId: "book-1",
        status: "SUCCEEDED"
      },
      orderBy: [
        { finishedAt: "desc" },
        { updatedAt: "desc" }
      ],
      select: expect.objectContaining({
        scope         : true,
        chapterStart  : true,
        chapterEnd    : true,
        chapterIndices: true
      })
    });
    expect(result).toEqual({
      status  : "PROCESSING",
      progress: 70,
      stage   : "实体提取",
      errorLog: "第 9 章解析失败",
      chapters: [
        { no: 1, title: "第一回", parseStatus: "SUCCEEDED" },
        { no: 2, title: "第二回", parseStatus: "PROCESSING" }
      ]
    });
  });

  it("maps legacy pending chapter status to review pending by latest succeeded job scope", async () => {
    const bookFindFirst = vi.fn().mockResolvedValue({
      status       : "COMPLETED",
      parseProgress: 100,
      parseStage   : "完成",
      errorLog     : null,
      analysisJobs : [],
      chapters     : [
        { no: 1, type: "CHAPTER", title: "第一回", parseStatus: "PENDING" },
        { no: 2, type: "CHAPTER", title: "第二回", parseStatus: "PENDING" },
        { no: 3, type: "CHAPTER", title: "第三回", parseStatus: "PENDING" },
        { no: 1, type: "PRELUDE", title: "楔子", parseStatus: "PENDING" }
      ]
    });
    const analysisJobFindFirst = vi.fn().mockResolvedValue({
      scope         : "CHAPTER_RANGE",
      chapterStart  : 2,
      chapterEnd    : 3,
      chapterIndices: []
    });
    const service = createGetBookStatusService({
      book       : { findFirst: bookFindFirst },
      analysisJob: { findFirst: analysisJobFindFirst }
    } as never);

    const result = await service.getBookStatus("book-1");

    expect(result.chapters).toEqual([
      { no: 1, title: "第一回", parseStatus: "PENDING" },
      { no: 2, title: "第二回", parseStatus: "REVIEW_PENDING" },
      { no: 3, title: "第三回", parseStatus: "REVIEW_PENDING" },
      { no: 1, title: "楔子", parseStatus: "PENDING" }
    ]);
  });

  it("throws BookNotFoundError when book does not exist", async () => {
    // 防御语义：轮询目标不存在时应抛领域错误，由路由层转为 404，而不是返回空对象误导前端继续轮询。
    // Arrange
    const bookFindFirst = vi.fn().mockResolvedValue(null);
    const analysisJobFindFirst = vi.fn();
    const service = createGetBookStatusService({
      book       : { findFirst: bookFindFirst },
      analysisJob: { findFirst: analysisJobFindFirst }
    } as never);

    // Act + Assert
    await expect(service.getBookStatus("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
    expect(analysisJobFindFirst).not.toHaveBeenCalled();
  });
});
