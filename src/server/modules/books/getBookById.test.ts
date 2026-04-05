import { describe, expect, it, vi } from "vitest";

import { BookNotFoundError } from "@/server/modules/books/errors";
import { createGetBookByIdService } from "@/server/modules/books/getBookById";

/**
 * 文件定位（书籍详情服务单测）：
 * - 验证 `getBookById` 会把数据库结构映射为“馆藏详情视图模型”。
 * - 该服务是书籍详情页/API 的核心下游，字段稳定性直接影响页面渲染与功能按钮显隐。
 *
 * 业务设计要点：
 * - 章节数/人物数/最近分析时间/模型名称属于派生字段，需要在服务层集中计算，减少前端重复拼装。
 */
describe("getBookById", () => {
  it("returns one book in library detail shape", async () => {
    // 场景：验证服务将多表信息（book + analysisJobs + phaseLogs）压平为前端可直出结构。
    // Arrange
    const findFirst = vi.fn().mockResolvedValue({
      id            : "book-1",
      title         : "儒林外史",
      author        : "吴敬梓",
      dynasty       : "清",
      description   : "群像小说",
      coverUrl      : "/api/assets/books/book-1/cover/cover.png",
      status        : "COMPLETED",
      errorLog      : null,
      createdAt     : new Date("2026-03-24T09:10:00.000Z"),
      updatedAt     : new Date("2026-03-24T10:10:00.000Z"),
      sourceFileKey : "books/book-1/source/original.txt",
      sourceFileUrl : "/api/assets/books/book-1/source/original.txt",
      sourceFileName: "rulin.txt",
      sourceFileMime: "text/plain; charset=utf-8",
      sourceFileSize: 999,
      chapters      : [{ id: "chapter-1" }, { id: "chapter-2" }],
      profiles      : [{ id: "profile-1" }],
      analysisJobs  : [
        {
          updatedAt : new Date("2026-03-24T10:09:00.000Z"),
          finishedAt: new Date("2026-03-24T10:09:30.000Z"),
          errorLog  : null,
          phaseLogs : [{
            model: {
              name: "DeepSeek V3"
            }
          }]
        }
      ]
    });
    const service = createGetBookByIdService({ book: { findFirst } } as never);

    // Act
    const result = await service.getBookById("book-1");

    // Assert
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id       : "book-1",
        deletedAt: null
      }
    }));
    expect(result).toEqual({
      id              : "book-1",
      title           : "儒林外史",
      author          : "吴敬梓",
      dynasty         : "清",
      coverUrl        : "/api/assets/books/book-1/cover/cover.png",
      status          : "COMPLETED",
      chapterCount    : 2,
      personaCount    : 1,
      lastAnalyzedAt  : "2026-03-24T10:09:30.000Z",
      currentModel    : "DeepSeek V3",
      lastErrorSummary: null,
      createdAt       : "2026-03-24T09:10:00.000Z",
      updatedAt       : "2026-03-24T10:10:00.000Z",
      sourceFile      : {
        key : "books/book-1/source/original.txt",
        url : "/api/assets/books/book-1/source/original.txt",
        name: "rulin.txt",
        mime: "text/plain; charset=utf-8",
        size: 999
      }
    });
  });

  it("throws BookNotFoundError when id does not exist", async () => {
    // 防御分支：不存在的书籍 ID 应抛出领域错误，而不是返回空对象，避免前端误判为“合法空态”。
    // Arrange
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = createGetBookByIdService({ book: { findFirst } } as never);

    // Act + Assert
    await expect(service.getBookById("missing-book")).rejects.toBeInstanceOf(BookNotFoundError);
  });
});
