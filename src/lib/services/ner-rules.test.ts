import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  batchNerLexiconRuleAction,
  createNerLexiconRule,
  deleteNerLexiconRule,
  fetchNerLexiconRules,
  generateNerLexiconRules,
  pollNerGenerationJob,
  previewNerLexiconGenerationPrompt,
  reorderNerLexiconRules,
  updateNerLexiconRule
} from "@/lib/services/ner-rules";

const hoisted = vi.hoisted(() => ({
  clientFetchMock : vi.fn(),
  clientMutateMock: vi.fn()
}));

vi.mock("@/lib/client-api", () => ({
  clientFetch : hoisted.clientFetchMock,
  clientMutate: hoisted.clientMutateMock
}));

describe("ner-rules service", () => {
  beforeEach(() => {
    hoisted.clientFetchMock.mockReset();
    hoisted.clientMutateMock.mockReset();
  });

  it("posts batch ner rule actions and returns affected count", async () => {
    hoisted.clientFetchMock.mockResolvedValueOnce({ count: 3 });

    await expect(batchNerLexiconRuleAction({
      action: "disable",
      ids   : [
        "11111111-1111-4111-8111-111111111111",
        "22222222-2222-4222-8222-222222222222",
        "33333333-3333-4333-8333-333333333333"
      ]
    })).resolves.toEqual({ count: 3 });

    expect(hoisted.clientFetchMock).toHaveBeenCalledWith("/api/admin/knowledge/ner-rules/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        action: "disable",
        ids   : [
          "11111111-1111-4111-8111-111111111111",
          "22222222-2222-4222-8222-222222222222",
          "33333333-3333-4333-8333-333333333333"
        ]
      })
    });
    expect(hoisted.clientMutateMock).not.toHaveBeenCalled();
  });

  it("uses ner lexicon endpoints and generation payloads", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([{ id: "rule-1" }])
      .mockResolvedValueOnce({ id: "rule-2" })
      .mockResolvedValueOnce({ systemPrompt: "system", userPrompt: "user" })
      .mockResolvedValueOnce({ jobId: "job-ner-1" })
      .mockResolvedValueOnce({
        jobId : "job-ner-1",
        status: "done",
        step  : "生成完成",
        result: {
          created: 2,
          skipped: 1,
          model  : { id: "model-1", provider: "glm", modelName: "glm-4.5" }
        },
        error: null
      });
    hoisted.clientMutateMock.mockResolvedValue(undefined);

    await fetchNerLexiconRules({
      ruleType  : "HARD_BLOCK_SUFFIX",
      bookTypeId: "11111111-1111-4111-8111-111111111111"
    });
    await createNerLexiconRule({
      ruleType  : "TITLE_STEM",
      content   : "大人",
      bookTypeId: "22222222-2222-4222-8222-222222222222",
      sortOrder : 2,
      changeNote: "seed"
    });
    await updateNerLexiconRule("rule-2", {
      content   : "老爷",
      bookTypeId: null,
      sortOrder : 3,
      isActive  : false,
      changeNote: "disable"
    });
    await deleteNerLexiconRule("rule-2");
    await reorderNerLexiconRules(["rule-3", "rule-4"]);
    await previewNerLexiconGenerationPrompt({
      ruleType              : "TITLE_STEM",
      targetCount           : 15,
      bookTypeId            : "33333333-3333-4333-8333-333333333333",
      additionalInstructions: "优先补充古代敬称"
    });
    await generateNerLexiconRules({
      ruleType              : "TITLE_STEM",
      targetCount           : 15,
      bookTypeId            : "33333333-3333-4333-8333-333333333333",
      additionalInstructions: "优先补充古代敬称",
      modelId               : "44444444-4444-4444-8444-444444444444"
    });
    await pollNerGenerationJob("job-ner-1");

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/admin/knowledge/ner-rules?ruleType=HARD_BLOCK_SUFFIX&bookTypeId=11111111-1111-4111-8111-111111111111"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/ner-rules", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType  : "TITLE_STEM",
        content   : "大人",
        bookTypeId: "22222222-2222-4222-8222-222222222222",
        sortOrder : 2,
        changeNote: "seed"
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/ner-rules/rule-2", {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        content   : "老爷",
        bookTypeId: null,
        sortOrder : 3,
        isActive  : false,
        changeNote: "disable"
      })
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(2, "/api/admin/knowledge/ner-rules/rule-2", {
      method: "DELETE"
    });
    expect(hoisted.clientMutateMock).toHaveBeenNthCalledWith(3, "/api/admin/knowledge/ner-rules/reorder", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ orderedIds: ["rule-3", "rule-4"] })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/admin/knowledge/ner-rules/generate/preview-prompt?ruleType=TITLE_STEM&targetCount=15&bookTypeId=33333333-3333-4333-8333-333333333333&additionalInstructions=%E4%BC%98%E5%85%88%E8%A1%A5%E5%85%85%E5%8F%A4%E4%BB%A3%E6%95%AC%E7%A7%B0"
    );
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(4, "/api/admin/knowledge/ner-rules/generate", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType              : "TITLE_STEM",
        targetCount           : 15,
        bookTypeId            : "33333333-3333-4333-8333-333333333333",
        additionalInstructions: "优先补充古代敬称",
        modelId               : "44444444-4444-4444-8444-444444444444"
      })
    });
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(5, "/api/admin/knowledge/ner-rules/generate?jobId=job-ner-1");
  });

  it("omits optional ner rule query parameters when they are not provided", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce({ systemPrompt: "system", userPrompt: "user" });

    await fetchNerLexiconRules();
    await previewNerLexiconGenerationPrompt({
      ruleType: "POSITION_STEM"
    });

    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(1, "/api/admin/knowledge/ner-rules");
    expect(hoisted.clientFetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/admin/knowledge/ner-rules/generate/preview-prompt?ruleType=POSITION_STEM"
    );
  });
});
