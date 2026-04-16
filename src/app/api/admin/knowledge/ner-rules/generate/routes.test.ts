import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
const getAuthContextMock = vi.fn();
const requireAdminMock = vi.fn();
const createJobMock = vi.fn();
const getJobMock = vi.fn();
const updateJobMock = vi.fn();
const generateNerLexiconRulesMock = vi.fn();
const previewNerLexiconGenerationPromptMock = vi.fn();

const BOOK_TYPE_ID = "11111111-1111-4111-8111-111111111111";

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/auth", () => ({
  getAuthContext: getAuthContextMock,
  requireAdmin  : requireAdminMock,
  AuthError     : class AuthError extends Error {
    code: string;

    constructor(code: string, message: string) {
      super(message);
      this.code = code;
    }
  }
}));

vi.mock("@/server/lib/knowledge-job-store", () => ({
  createJob: createJobMock,
  getJob   : getJobMock,
  updateJob: updateJobMock
}));

vi.mock("@/server/modules/knowledge", () => ({
  generateNerLexiconRules          : generateNerLexiconRulesMock,
  previewNerLexiconGenerationPrompt: previewNerLexiconGenerationPromptMock
}));

describe("knowledge ner-rules generate routes", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers());
    getAuthContextMock.mockResolvedValue({ userId: "admin-1" });
    requireAdminMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    headersMock.mockReset();
    getAuthContextMock.mockReset();
    requireAdminMock.mockReset();
    createJobMock.mockReset();
    getJobMock.mockReset();
    updateJobMock.mockReset();
    generateNerLexiconRulesMock.mockReset();
    previewNerLexiconGenerationPromptMock.mockReset();
    vi.resetModules();
  });

  it("submits and polls ner generation jobs", async () => {
    generateNerLexiconRulesMock.mockResolvedValueOnce({
      created: 2,
      skipped: 1,
      model  : { id: "model-1", provider: "glm", modelName: "glm-4.5" }
    });

    const { GET, POST } = await import("./route");

    const submitResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType              : "TITLE_STEM",
        targetCount           : 12,
        bookTypeId            : BOOK_TYPE_ID,
        additionalInstructions: "优先补充古代敬称",
        modelId               : "22222222-2222-4222-8222-222222222222"
      })
    }));

    expect(submitResponse.status).toBe(200);
    const submitBody = await submitResponse.json();
    const jobId = submitBody.data.jobId as string;

    expect(createJobMock).toHaveBeenCalledWith(jobId);
    expect(updateJobMock).toHaveBeenNthCalledWith(1, jobId, {
      status: "running",
      step  : "正在连接模型，准备生成…"
    });
    expect(generateNerLexiconRulesMock).toHaveBeenCalledWith({
      ruleType              : "TITLE_STEM",
      targetCount           : 12,
      bookTypeId            : BOOK_TYPE_ID,
      additionalInstructions: "优先补充古代敬称",
      modelId               : "22222222-2222-4222-8222-222222222222"
    });

    await Promise.resolve();

    expect(updateJobMock).toHaveBeenNthCalledWith(2, jobId, {
      status: "done",
      step  : "生成完成",
      result: {
        created: 2,
        skipped: 1,
        model  : { id: "model-1", provider: "glm", modelName: "glm-4.5" }
      }
    });

    getJobMock.mockReturnValueOnce({
      id    : jobId,
      status: "done",
      step  : "生成完成",
      result: {
        created: 2,
        skipped: 1,
        model  : { id: "model-1", provider: "glm", modelName: "glm-4.5" }
      }
    });

    const pollResponse = await GET(new Request(`http://localhost/api/admin/knowledge/ner-rules/generate?jobId=${jobId}`));

    expect(pollResponse.status).toBe(200);
    const pollBody = await pollResponse.json();
    expect(pollBody.data).toEqual({
      jobId,
      status: "done",
      step  : "生成完成",
      result: {
        created: 2,
        skipped: 1,
        model  : { id: "model-1", provider: "glm", modelName: "glm-4.5" }
      },
      error: null
    });
  });

  it("returns validation errors for invalid ner generation requests and missing job ids", async () => {
    const { GET, POST } = await import("./route");

    const missingJobResponse = await GET(new Request("http://localhost/api/admin/knowledge/ner-rules/generate"));
    expect(missingJobResponse.status).toBe(400);

    const invalidSubmitResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType   : "INVALID",
        targetCount: 0
      })
    }));

    expect(invalidSubmitResponse.status).toBe(400);
    expect(createJobMock).not.toHaveBeenCalled();
    expect(generateNerLexiconRulesMock).not.toHaveBeenCalled();
  });

  it("stores ner generation errors and reports unknown jobs", async () => {
    generateNerLexiconRulesMock.mockRejectedValueOnce(new Error("model offline"));

    const { GET, POST } = await import("./route");

    const submitResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType   : "TITLE_STEM",
        targetCount: 12
      })
    }));

    const submitBody = await submitResponse.json();
    const jobId = submitBody.data.jobId as string;

    await Promise.resolve();
    await Promise.resolve();

    expect(updateJobMock).toHaveBeenNthCalledWith(1, jobId, {
      status: "running",
      step  : "正在连接模型，准备生成…"
    });
    expect(updateJobMock).toHaveBeenNthCalledWith(2, jobId, {
      status: "error",
      step  : "生成失败",
      error : "model offline"
    });

    getJobMock.mockReturnValueOnce(undefined);

    const missingJobResponse = await GET(new Request("http://localhost/api/admin/knowledge/ner-rules/generate?jobId=missing-job"));

    expect(missingJobResponse.status).toBe(500);
  });

  it("previews ner generation prompts", async () => {
    previewNerLexiconGenerationPromptMock.mockResolvedValueOnce({
      systemPrompt: "system",
      userPrompt  : "user"
    });

    const { GET } = await import("./preview-prompt/route");

    const response = await GET(new Request(
      `http://localhost/api/admin/knowledge/ner-rules/generate/preview-prompt?ruleType=TITLE_STEM&targetCount=18&bookTypeId=${BOOK_TYPE_ID}&additionalInstructions=${encodeURIComponent("优先补充古代敬称")}`
    ));

    expect(response.status).toBe(200);
    expect(previewNerLexiconGenerationPromptMock).toHaveBeenCalledWith({
      ruleType              : "TITLE_STEM",
      targetCount           : 18,
      bookTypeId            : BOOK_TYPE_ID,
      additionalInstructions: "优先补充古代敬称"
    });
  });

  it("returns preview validation and service errors for ner generation prompts", async () => {
    const { GET } = await import("./preview-prompt/route");

    const invalidResponse = await GET(new Request(
      "http://localhost/api/admin/knowledge/ner-rules/generate/preview-prompt?ruleType=INVALID&targetCount=0"
    ));
    expect(invalidResponse.status).toBe(400);

    previewNerLexiconGenerationPromptMock.mockRejectedValueOnce(new Error("book type missing"));

    const failedResponse = await GET(new Request(
      `http://localhost/api/admin/knowledge/ner-rules/generate/preview-prompt?ruleType=TITLE_STEM&bookTypeId=${BOOK_TYPE_ID}`
    ));

    expect(failedResponse.status).toBe(500);
  });
});
