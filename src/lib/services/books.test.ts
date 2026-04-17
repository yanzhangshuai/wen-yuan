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

  it("createBook uploads form data and returns created book data", async () => {
    // Arrange
    const created = { id: "book-1", title: "儒林外史" };
    const formData = new FormData();
    formData.set("title", "儒林外史");
    clientFetchMock.mockResolvedValue(created);
    const { createBook } = await import("@/lib/services/books");

    // Act
    const result = await createBook(formData);

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books", {
      method: "POST",
      body  : formData
    });
    expect(result).toEqual(created);
  });

  it("fetchChapterPreview unwraps preview items and encodes the book id", async () => {
    // Arrange
    clientFetchMock.mockResolvedValue({
      items: [
        {
          index      : 1,
          chapterType: "CHAPTER",
          title      : "第一回",
          wordCount  : 1200
        }
      ]
    });
    const { fetchChapterPreview } = await import("@/lib/services/books");

    // Act
    const result = await fetchChapterPreview("book/001");

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book%2F001/chapters/preview");
    expect(result).toEqual([
      {
        index      : 1,
        chapterType: "CHAPTER",
        title      : "第一回",
        wordCount  : 1200
      }
    ]);
  });

  it("confirmBookChapters posts the confirmed chapter payload", async () => {
    // Arrange
    clientMutateMock.mockResolvedValue(undefined);
    const { confirmBookChapters } = await import("@/lib/services/books");
    const items = [{
      index      : 1,
      chapterType: "CHAPTER" as const,
      title      : "第一回",
      content    : "正文"
    }];

    // Act
    await confirmBookChapters("book/001", items);

    // Assert
    expect(clientMutateMock).toHaveBeenCalledWith("/api/books/book%2F001/chapters/confirm", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ items })
    });
  });

  it("startAnalysis sends task-level modelStrategy payload", async () => {
    // 业务规则：分析任务支持按阶段覆盖模型策略，前端必须原样透传，不可在客户端静默裁剪字段。
    // Arrange
    clientMutateMock.mockResolvedValue(undefined);
    const { startAnalysis } = await import("@/lib/services/books");
    const payload = {
      architecture : "threestage" as const,
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

  it("fetchBookStatus reads the status snapshot for a book", async () => {
    // Arrange
    const snapshot = {
      status  : "PROCESSING",
      progress: 45,
      stage   : "实体提取（第3/8章）",
      chapters: [{ no: 3, title: "第三回", parseStatus: "PROCESSING" }]
    };
    clientFetchMock.mockResolvedValue(snapshot);
    const { fetchBookStatus } = await import("@/lib/services/books");

    // Act
    const result = await fetchBookStatus("book/001");

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book%2F001/status");
    expect(result).toEqual(snapshot);
  });

  it("reanalyzeChapters sends a chapter-list payload", async () => {
    // Arrange
    clientMutateMock.mockResolvedValue(undefined);
    const { reanalyzeChapters } = await import("@/lib/services/books");

    // Act
    await reanalyzeChapters("book/001", [2, 4, 8]);

    // Assert
    expect(clientMutateMock).toHaveBeenCalledWith("/api/books/book%2F001/analyze", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ scope: "CHAPTER_LIST", chapterIndices: [2, 4, 8] })
    });
  });

  it("deleteBookById issues a delete request", async () => {
    // Arrange
    clientMutateMock.mockResolvedValue(undefined);
    const { deleteBookById } = await import("@/lib/services/books");

    // Act
    await deleteBookById("book/001");

    // Assert
    expect(clientMutateMock).toHaveBeenCalledWith("/api/books/book%2F001", {
      method: "DELETE"
    });
  });

  it("fetchBookJobs requests the jobs list", async () => {
    // Arrange
    const jobs = [{
      id            : "job-1",
      status        : "SUCCEEDED",
      architecture  : "sequential",
      scope         : "FULL_BOOK",
      chapterStart  : null,
      chapterEnd    : null,
      chapterIndices: [],
      attempt       : 1,
      errorLog      : null,
      startedAt     : "2026-04-10T09:00:00.000Z",
      finishedAt    : "2026-04-10T09:10:00.000Z",
      createdAt     : "2026-04-10T08:59:00.000Z",
      aiModelName   : "DeepSeek V3"
    }];
    clientFetchMock.mockResolvedValue(jobs);
    const { fetchBookJobs } = await import("@/lib/services/books");

    // Act
    const result = await fetchBookJobs("book/001");

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book%2F001/jobs");
    expect(result).toEqual(jobs);
  });

  it("fetchBookPersonas requests the persona list", async () => {
    // Arrange
    const personas = [{
      id           : "persona-1",
      profileId    : "profile-1",
      bookId       : "book-1",
      name         : "范进",
      localName    : "范进",
      aliases      : ["范举人"],
      gender       : "MALE",
      hometown     : "广东",
      nameType     : "NAMED",
      globalTags   : [],
      localTags    : ["举人"],
      officialTitle: "举人",
      localSummary : "中举人物",
      ironyIndex   : 0.2,
      confidence   : 0.9,
      recordSource : "AI",
      status       : "ACTIVE"
    }];
    clientFetchMock.mockResolvedValue(personas);
    const { fetchBookPersonas } = await import("@/lib/services/books");

    // Act
    const result = await fetchBookPersonas("book/001");

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book%2F001/personas");
    expect(result).toEqual(personas);
  });

  it("fetchChapterContent maps the reading payload and includes paraIndex when provided", async () => {
    // Arrange
    clientFetchMock.mockResolvedValue({
      chapterNo   : 3,
      chapterTitle: "第三回",
      paragraphs  : [{ text: "甲" }, { text: "乙" }]
    });
    const { fetchChapterContent } = await import("@/lib/services/books");

    // Act
    const result = await fetchChapterContent("book/001", "chapter/003", 7);

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book%2F001/chapters/chapter%2F003/read?paraIndex=7");
    expect(result).toEqual({
      title     : "第三回",
      chapterNo : 3,
      paragraphs: ["甲", "乙"]
    });
  });

  it("fetchChapterContent omits the query string when paraIndex is absent", async () => {
    // Arrange
    clientFetchMock.mockResolvedValue({
      chapterNo   : 1,
      chapterTitle: "第一回",
      paragraphs  : [{ text: "正文" }]
    });
    const { fetchChapterContent } = await import("@/lib/services/books");

    // Act
    const result = await fetchChapterContent("book-1", "chapter-1");

    // Assert
    expect(clientFetchMock).toHaveBeenCalledWith("/api/books/book-1/chapters/chapter-1/read");
    expect(result).toEqual({
      title     : "第一回",
      chapterNo : 1,
      paragraphs: ["正文"]
    });
  });
});
