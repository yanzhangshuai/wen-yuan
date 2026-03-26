import { AnalysisJobStatus, AppRole } from "@/generated/prisma/enums";
import { afterEach, describe, expect, it, vi } from "vitest";

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

  class AnalysisModelNotFoundError extends Error {
    constructor(modelId: string) {
      super(`AI model not found: ${modelId}`);
    }
  }

  class AnalysisModelDisabledError extends Error {
    constructor(modelId: string) {
      super(`AI model is disabled: ${modelId}`);
    }
  }

  class AnalysisScopeInvalidError extends Error {}

  return {
    ANALYSIS_SCOPE_VALUES            : ["FULL_BOOK", "CHAPTER_RANGE"] as const,
    ANALYSIS_OVERRIDE_STRATEGY_VALUES: ["DRAFT_ONLY", "ALL_DRAFTS"] as const,
    startBookAnalysis                : startBookAnalysisMock,
    BookNotFoundError,
    AnalysisModelNotFoundError,
    AnalysisModelDisabledError,
    AnalysisScopeInvalidError
  };
});

vi.mock("@/server/modules/analysis/jobs/runAnalysisJob", () => {
  return {
    runAnalysisJobById: runAnalysisJobByIdMock
  };
});

describe("POST /api/books/:id/analyze", () => {
  afterEach(() => {
    startBookAnalysisMock.mockReset();
    runAnalysisJobByIdMock.mockReset();
    runAnalysisJobByIdMock.mockImplementation(async () => undefined);
  });

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
      aiModelId       : "model-1",
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
        body: JSON.stringify({ aiModelId: "cc06e3e5-8728-4de8-b76c-3ff40eb57ef8" })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(202);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("BOOK_ANALYSIS_STARTED");
    expect(startBookAnalysisMock).toHaveBeenCalledWith(bookId, {
      aiModelId       : "cc06e3e5-8728-4de8-b76c-3ff40eb57ef8",
      chapterEnd      : undefined,
      chapterStart    : undefined,
      scope           : undefined,
      overrideStrategy: undefined,
      keepHistory     : undefined
    });
    expect(runAnalysisJobByIdMock).toHaveBeenCalledWith("job-1");
  });

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
        body: JSON.stringify({ aiModelId: "not-uuid" })
      }),
      { params: Promise.resolve({ id: bookId }) }
    );

    // Assert
    expect(response.status).toBe(400);
    expect(startBookAnalysisMock).not.toHaveBeenCalled();
  });

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
});
