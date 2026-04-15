import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createPromptExtractionRule,
  deletePromptExtractionRule,
  fetchPromptExtractionRules,
  previewCombinedPromptRules,
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

  it("uses prompt extraction rule endpoints and payloads", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([{ id: "rule-1" }])
      .mockResolvedValueOnce({ id: "rule-2" })
      .mockResolvedValueOnce({ count: 2, combined: "1. 规则一\n2. 规则二" });
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
  });
});
