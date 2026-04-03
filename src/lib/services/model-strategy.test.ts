import { beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineStage } from "@/types/pipeline";

const clientFetchMock = vi.fn();

vi.mock("@/lib/client-api", () => ({
  clientFetch: clientFetchMock
}));

describe("model-strategy service", () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
  });

  it("fetchGlobalStrategy returns null when GLOBAL strategy not configured", async () => {
    // Arrange
    clientFetchMock.mockResolvedValue(null);
    const { fetchGlobalStrategy } = await import("@/lib/services/model-strategy");

    // Act
    const result = await fetchGlobalStrategy();

    // Assert
    expect(result).toBeNull();
    expect(clientFetchMock).toHaveBeenCalledWith("/api/admin/model-strategy/global", {
      cache: "no-store"
    });
  });

  it("saveGlobalStrategy sends stages payload", async () => {
    // Arrange
    clientFetchMock.mockResolvedValue({
      id       : "cfg-1",
      scope    : "GLOBAL",
      bookId   : null,
      jobId    : null,
      stages   : {},
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    });
    const { saveGlobalStrategy } = await import("@/lib/services/model-strategy");
    const strategy = {
      [PipelineStage.ROSTER_DISCOVERY]: {
        modelId        : "c75a4e5c-2229-4906-a1a2-c7783f7f3f6a",
        temperature    : 0.4,
        maxRetries     : 2,
        retryBaseMs    : 500,
        topP           : 0.9,
        maxOutputTokens: 4096
      }
    };

    // Act
    await saveGlobalStrategy(strategy);

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/admin/model-strategy/global", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ stages: strategy })
    });
  });

  it("fetchBookStrategy unwraps stages payload", async () => {
    // Arrange
    const bookId = "book/001";
    const strategy = {
      [PipelineStage.CHUNK_EXTRACTION]: { modelId: "4dbb235a-48ea-40ad-a9d3-355f6f94935f" }
    };
    clientFetchMock.mockResolvedValue({
      id       : "cfg-2",
      scope    : "BOOK",
      bookId   : "book-1",
      jobId    : null,
      stages   : strategy,
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    });
    const { fetchBookStrategy } = await import("@/lib/services/model-strategy");

    // Act
    const result = await fetchBookStrategy(bookId);

    // Assert
    expect(result).toEqual(strategy);
    expect(clientFetchMock).toHaveBeenCalledWith("/api/admin/books/book%2F001/model-strategy", {
      cache: "no-store"
    });
  });

  it("saveBookStrategy sends encoded path and stages payload", async () => {
    // Arrange
    clientFetchMock.mockResolvedValue({
      id       : "cfg-3",
      scope    : "BOOK",
      bookId   : "book-1",
      jobId    : null,
      stages   : {},
      createdAt: "2026-04-03T00:00:00.000Z",
      updatedAt: "2026-04-03T00:00:00.000Z"
    });
    const { saveBookStrategy } = await import("@/lib/services/model-strategy");
    const strategy = {
      [PipelineStage.FALLBACK]: { modelId: "dc2beaad-fdf2-4c58-9a64-184950310f3e" }
    };

    // Act
    await saveBookStrategy("book/001", strategy);

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/admin/books/book%2F001/model-strategy", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ stages: strategy })
    });
  });

  it("fetchJobCostSummary reads cost summary endpoint", async () => {
    // Arrange
    const summary = {
      jobId                : "job-1",
      totalPromptTokens    : 100,
      totalCompletionTokens: 50,
      totalDurationMs      : 3200,
      totalCalls           : 3,
      failedCalls          : 1,
      fallbackCalls        : 1,
      byStage              : []
    };
    clientFetchMock.mockResolvedValue(summary);
    const { fetchJobCostSummary } = await import("@/lib/services/model-strategy");

    // Act
    const result = await fetchJobCostSummary("job/001");

    // Assert
    expect(result).toEqual(summary);
    expect(clientFetchMock).toHaveBeenCalledWith("/api/admin/analysis-jobs/job%2F001/cost-summary", {
      cache: "no-store"
    });
  });
});
