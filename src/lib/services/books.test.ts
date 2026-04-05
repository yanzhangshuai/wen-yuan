import { beforeEach, describe, expect, it, vi } from "vitest";

import { PipelineStage } from "@/types/pipeline";

const clientFetchMock = vi.fn();
const clientMutateMock = vi.fn();

vi.mock("@/lib/client-api", () => ({
  clientFetch : clientFetchMock,
  clientMutate: clientMutateMock
}));

/**
 * 文件定位（前端服务层单测）：
 * - 覆盖 `src/lib/services/books.ts` 对后端接口的调用契约。
 * - 该层位于 React 页面与 HTTP API 之间，负责把页面动作翻译成标准请求。
 *
 * 业务意义：
 * - 保障关键路径“启动分析/重试分析”发送的 URL、方法、请求体结构稳定。
 * - 一旦请求契约漂移，前端可能出现按钮可点但后端无效的隐性故障。
 */
describe("books service", () => {
  beforeEach(() => {
    // 每个用例独立执行：清空 mock 调用历史，避免前一个场景污染后一个断言。
    clientFetchMock.mockReset();
    clientMutateMock.mockReset();
  });

  it("startAnalysis sends task-level modelStrategy payload", async () => {
    // 业务规则：分析任务支持按阶段覆盖模型策略，前端必须原样透传，不可在客户端静默裁剪字段。
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
    // 业务语义：重试动作需要显式发送空对象，保持后端处理分支一致，避免 body 缺失导致签名/校验差异。
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
