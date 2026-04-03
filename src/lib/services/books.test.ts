import { beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineStage } from "@/types/pipeline";

const clientFetchMock = vi.fn();
const clientMutateMock = vi.fn();

vi.mock("@/lib/client-api", () => ({
  clientFetch : clientFetchMock,
  clientMutate: clientMutateMock
}));

describe("books service", () => {
  beforeEach(() => {
    clientFetchMock.mockReset();
    clientMutateMock.mockReset();
  });

  it("startAnalysis sends task-level modelStrategy payload", async () => {
    // Arrange
    clientMutateMock.mockResolvedValue(undefined);
    const { startAnalysis } = await import("@/lib/services/books");
    const payload = {
      scope        : "FULL_BOOK" as const,
      modelStrategy: {
        stages: {
          [PipelineStage.ROSTER_DISCOVERY]: {
            modelId        : "1b17f0dc-c5de-4f31-8d56-8d0f8f35f562",
            temperature    : 0.2,
            maxOutputTokens: 4096,
            topP           : 1,
            maxRetries     : 2,
            retryBaseMs    : 600
          },
          [PipelineStage.FALLBACK]: {
            modelId: "2820e6bc-54c8-42e5-ae05-a9956687ab09"
          }
        }
      }
    };

    // Act
    await startAnalysis("book/001", payload);

    // Assert
    expect(clientMutateMock).toHaveBeenCalledWith("/api/books/book%2F001/analyze", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify(payload)
    });
  });

  it("restartAnalysis sends empty request body", async () => {
    // Arrange
    clientMutateMock.mockResolvedValue(undefined);
    const { restartAnalysis } = await import("@/lib/services/books");

    // Act
    await restartAnalysis("book-id");

    // Assert
    expect(clientMutateMock).toHaveBeenCalledWith("/api/books/book-id/analyze", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({})
    });
  });
});
