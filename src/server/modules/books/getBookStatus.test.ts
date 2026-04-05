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
    const findFirst = vi.fn().mockResolvedValue({
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
        { no: 1, title: "第一回", parseStatus: "SUCCEEDED" },
        { no: 2, title: "第二回", parseStatus: "PROCESSING" }
      ]
    });
    const service = createGetBookStatusService({ book: { findFirst } } as never);

    // Act
    const result = await service.getBookStatus("book-1");

    // Assert
    expect(findFirst).toHaveBeenCalledOnce();
    expect(findFirst).toHaveBeenCalledWith({
      where: {
        id       : "book-1",
        deletedAt: null
      },
      select: expect.objectContaining({
        status       : true,
        parseProgress: true,
        parseStage   : true,
        errorLog     : true,
        chapters     : expect.objectContaining({ select: expect.objectContaining({ parseStatus: true }) })
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

  it("throws BookNotFoundError when book does not exist", async () => {
    // 防御语义：轮询目标不存在时应抛领域错误，由路由层转为 404，而不是返回空对象误导前端继续轮询。
    // Arrange
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = createGetBookStatusService({ book: { findFirst } } as never);

    // Act + Assert
    await expect(service.getBookStatus("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
