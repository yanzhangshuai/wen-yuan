import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchPromptExtractionRuleAction,
  createPromptExtractionRule,
  deletePromptExtractionRule,
  fetchPromptExtractionRules,
  generatePromptExtractionRules,
  pollPromptRuleGenerationJob,
  previewCombinedPromptRules,
  previewPromptExtractionGenerationPrompt,
  reorderPromptExtractionRules,
  updatePromptExtractionRule
} from "@/lib/services/prompt-extraction-rules";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("prompt-extraction-rules service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("posts batch prompt extraction rule actions and returns affected count", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ count: 2 });

    await expect(batchPromptExtractionRuleAction({
      action    : "changeBookType",
      ids       : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
      bookTypeId: "33333333-3333-4333-8333-333333333333"
    })).resolves.toEqual({ count: 2 });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/knowledge/prompt-extraction-rules/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        action    : "changeBookType",
        ids       : ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"],
        bookTypeId: "33333333-3333-4333-8333-333333333333"
      })
    });
    expect(hoisted.clientMutateMock).not.toHaveBeenCalled();
  });

  it("uses prompt extraction rule endpoints and generation payloads", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([{ id: "rule-1" }])
      .mockResolvedValueOnce({ id: "rule-2" })
      .mockResolvedValueOnce({ count: 2, combined: "1. 规则一\n2. 规则二" })
      .mockResolvedValueOnce({ systemPrompt: "system", userPrompt: "user" })
      .mockResolvedValueOnce({ jobId: "job-prompt-1" })
      .mockResolvedValueOnce({
        jobId : "job-prompt-1",
        status: "done",
        step  : "生成完成",
        result: {
          created: 2,
          skipped: 1,
          model  : { id: "model-1", provider: "qwen", modelName: "qwen-max" }
        },
        error: null
      });
    hoisted.clientMutateMock.mockResolvedValue(undefined);

    await fetchPromptExtractionRules({
      ruleType  : "ENTITY",
      bookTypeId: "11111111-1111-4111-8111-111111111111"
    });
    await createPromptExtractionRule({
      ruleType  : "ENTITY",
      content   : "抽取人物关系",
      bookTypeId: "22222222-2222-4222-8222-222222222222",
      sortOrder : 2,
      changeNote: "seed"
    });
    await updatePromptExtractionRule("rule-2", {
      content   : "抽取主角",
      bookTypeId: null,
      sortOrder : 3,
      isActive  : false,
      changeNote: "disable"
    });
    await deletePromptExtractionRule("rule-2");
    await reorderPromptExtractionRules(["rule-3", "rule-4"]);
    await previewCombinedPromptRules("RELATIONSHIP", "33333333-3333-4333-8333-333333333333");
    await previewPromptExtractionGenerationPrompt({
      ruleType              : "ENTITY",
      targetCount           : 12,
      bookTypeId            : "33333333-3333-4333-8333-333333333333",
      additionalInstructions: "优先补充实体抽取约束"
    });
    await generatePromptExtractionRules({
      ruleType              : "ENTITY",
      targetCount           : 12,
      bookTypeId            : "33333333-3333-4333-8333-333333333333",
      additionalInstructions: "优先补充实体抽取约束",
      modelId               : "44444444-4444-4444-8444-444444444444"
    });
    await pollPromptRuleGenerationJob("job-prompt-1");

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/knowledge/prompt-extraction-rules?ruleType=ENTITY&bookTypeId=11111111-1111-4111-8111-111111111111"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/prompt-extraction-rules", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType  : "ENTITY",
        content   : "抽取人物关系",
        bookTypeId: "22222222-2222-4222-8222-222222222222",
        sortOrder : 2,
        changeNote: "seed"
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/prompt-extraction-rules/rule-2", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        content   : "抽取主角",
        bookTypeId: null,
        sortOrder : 3,
        isActive  : false,
        changeNote: "disable"
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/prompt-extraction-rules/rule-2", {
      method: "DELETE"
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/prompt-extraction-rules/reorder", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ orderedIds: ["rule-3", "rule-4"] })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/prompt-extraction-rules/preview-combined", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType  : "RELATIONSHIP",
        bookTypeId: "33333333-3333-4333-8333-333333333333"
      })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      4,
      "/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt?ruleType=ENTITY&targetCount=12&bookTypeId=33333333-3333-4333-8333-333333333333&additionalInstructions=%E4%BC%98%E5%85%88%E8%A1%A5%E5%85%85%E5%AE%9E%E4%BD%93%E6%8A%BD%E5%8F%96%E7%BA%A6%E6%9D%9F"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(5, "/api/admin/knowledge/prompt-extraction-rules/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType              : "ENTITY",
        targetCount           : 12,
        bookTypeId            : "33333333-3333-4333-8333-333333333333",
        additionalInstructions: "优先补充实体抽取约束",
        modelId               : "44444444-4444-4444-8444-444444444444"
      })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(6, "/api/admin/knowledge/prompt-extraction-rules/generate?jobId=job-prompt-1");
  });

  it("omits optional prompt extraction query parameters when they are not provided", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ count: 0, combined: "", rules: [] })
      .mockResolvedValueOnce({ systemPrompt: "system", userPrompt: "user" });

    await fetchPromptExtractionRules();
    await previewCombinedPromptRules("ENTITY");
    await previewPromptExtractionGenerationPrompt({
      ruleType: "RELATIONSHIP"
    });

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/prompt-extraction-rules");
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/prompt-extraction-rules/preview-combined", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ ruleType: "ENTITY" })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/admin/knowledge/prompt-extraction-rules/generate/preview-prompt?ruleType=RELATIONSHIP"
    );
  });
});
