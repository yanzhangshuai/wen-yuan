import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  createNerLexiconRule,
  deleteNerLexiconRule,
  fetchNerLexiconRules,
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

  it("uses ner lexicon endpoints and payloads", async () => {
    hoisted.clientFetchMock
      .mockResolvedValueOnce([{ id: "rule-1" }])
      .mockResolvedValueOnce({ id: "rule-2" });
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
  });
});
