/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 app/ 目录下的 route.ts（或其动态路由变体）测试，验证接口层契约是否稳定。
 * - 在 Next.js 中，route.ts 由文件系统路由自动注册为 HTTP 接口；本测试通过直接调用导出的 HTTP 方法函数复现服务端执行语义。
 *
 * 业务职责：
 * - 约束请求参数校验、鉴权分支、服务层调用参数、错误码映射、统一响应包结构。
 * - 保护上下游协作边界：上游是浏览器/管理端请求，下游是各领域 service 与数据访问层。
 *
 * 维护注意：
 * - 这是接口契约测试，断言字段和状态码属于外部约定，不能随意改动。
 * - 若未来调整路由/错误码，请同步更新前端调用方与文档，否则会造成线上联调回归。
 */

import { AnalysisJobStatus, AppRole } from "@/generated/prisma/enums";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PipelineStage } from "@/types/pipeline";

const startBookAnalysisMock = vi.fn();
const runAnalysisJobByIdMock = vi.fn(async () => undefined);

vi.mock("@/server/modules/books/startBookAnalysis", () => {
  class BookNotFoundError extends Error {
    readonly bookId: string;

    constructor(bookId: string) {
      super(`Book not found: ${bookId}`);
      this.bookId = bookId;
    }
  }

  class AnalysisScopeInvalidError extends Error {}

  return {
    ANALYSIS_SCOPE_VALUES            : ["FULL_BOOK", "CHAPTER_RANGE", "CHAPTER_LIST"] as const,
    ANALYSIS_OVERRIDE_STRATEGY_VALUES: ["DRAFT_ONLY", "ALL_DRAFTS"] as const,
    startBookAnalysis                : startBookAnalysisMock,
    BookNotFoundError,
    AnalysisScopeInvalidError
  };
});

vi.mock("@/server/modules/analysis/jobs/runAnalysisJob", () => {
  return {
    runAnalysisJobById: runAnalysisJobByIdMock
  };
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/books/:id/analyze", () => {
  const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

  afterEach(() => {
    startBookAnalysisMock.mockReset();
    runAnalysisJobByIdMock.mockReset();
    runAnalysisJobByIdMock.mockImplementation(async () => undefined);
    consoleErrorSpy.mockClear();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("creates analysis job and returns 202", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    startBookAnalysisMock.mockResolvedValue({
      bookId,
      jobId           : "job-1",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false,
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    // Act
    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({})
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_ANALYSIS_STARTED");
    expect(startBookAnalysisMock).toHaveBeenCalledWith(bookId, {});
    expect(runAnalysisJobByIdMock).toHaveBeenCalledWith("job-1");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid route id", async () => {
    // Arrange
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    // Act
    const response = await POST(
      new Request("http://localhost/api/books/invalid/analyze", {
        method : "POST",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: "invalid" }) }
    );

    // Assert
    expect(response.status).toBe(400);
    expect(startBookAnalysisMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 for invalid request body", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    // Act
    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          modelStrategy: {
            stages: {
              ROSTER_DISCOVERY: {
                modelId: "not-uuid"
              }
            }
          }
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(400);
    expect(startBookAnalysisMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 404 when book not found", async () => {
    // Arrange
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { BookNotFoundError } = await import("@/server/modules/books/startBookAnalysis");
    startBookAnalysisMock.mockRejectedValue(new BookNotFoundError(bookId));
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    // Act
    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(404);
  });

  it("normalizes wrapped stage strategies before creating the job", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const modelId = "8ba43ac0-6f33-4d1a-a114-2509104d0786";
    startBookAnalysisMock.mockResolvedValue({
      bookId,
      jobId           : "job-2",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false,
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          modelStrategy: {
            stages: {
              [PipelineStage.ROSTER_DISCOVERY]: {
                modelId
              }
            }
          }
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(202);
    expect(startBookAnalysisMock).toHaveBeenCalledWith(bookId, {
      modelStrategy: {
        [PipelineStage.ROSTER_DISCOVERY]: {
          modelId
        }
      }
    });
  });

  it("keeps direct stage strategies unchanged when creating the job", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const modelId = "271dc37f-8c56-4ef8-b786-f50c77345166";
    startBookAnalysisMock.mockResolvedValue({
      bookId,
      jobId           : "job-3",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false,
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "Content-Type": "application/json",
          "x-auth-role" : AppRole.ADMIN
        },
        body: JSON.stringify({
          modelStrategy: {
            [PipelineStage.ROSTER_DISCOVERY]: {
              modelId
            }
          }
        })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(202);
    expect(startBookAnalysisMock).toHaveBeenCalledWith(bookId, {
      modelStrategy: {
        [PipelineStage.ROSTER_DISCOVERY]: {
          modelId
        }
      }
    });
  });

  it("returns 400 when the requested analysis scope is invalid", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    const { AnalysisScopeInvalidError } = await import("@/server/modules/books/startBookAnalysis");
    startBookAnalysisMock.mockRejectedValue(new AnalysisScopeInvalidError("chapter range invalid"));
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 500 when analysis creation fails unexpectedly", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    startBookAnalysisMock.mockRejectedValue(new Error("db unavailable"));
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
  });

  it("logs scheduling failures but still returns 202", async () => {
    const bookId = "3b80dad4-cb27-4ff8-a2fd-91a0f91cad39";
    startBookAnalysisMock.mockResolvedValue({
      bookId,
      jobId           : "job-4",
      status          : AnalysisJobStatus.QUEUED,
      scope           : "FULL_BOOK",
      chapterStart    : null,
      chapterEnd      : null,
      overrideStrategy: "DRAFT_ONLY",
      keepHistory     : false,
      bookStatus      : "PROCESSING",
      parseProgress   : 0,
      parseStage      : "文本清洗"
    });
    runAnalysisJobByIdMock.mockRejectedValue(new Error("runner offline"));
    const { POST } = await import("@/app/api/books/[id]/analyze/route");

    const response = await POST(
      new Request(`http://localhost/api/books/${bookId}/analyze`, {
        method : "POST",
        headers: {
          "x-auth-role": AppRole.ADMIN
        }
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    await vi.waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        "[analysis.runner] schedule.failed",
        expect.stringContaining("\"jobId\":\"job-4\"")
      );
    });

    expect(response.status).toBe(202);
  });
});
