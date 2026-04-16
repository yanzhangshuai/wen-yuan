import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
const getAuthContextMock = vi.fn();
const requireAdminMock = vi.fn();
const listNerLexiconRulesMock = vi.fn();
const createNerLexiconRuleMock = vi.fn();
const updateNerLexiconRuleMock = vi.fn();
const deleteNerLexiconRuleMock = vi.fn();
const reorderNerLexiconRulesMock = vi.fn();
const batchDeleteNerLexiconRulesMock = vi.fn();
const batchToggleNerLexiconRulesMock = vi.fn();
const batchChangeBookTypeNerLexiconRulesMock = vi.fn();

const BOOK_TYPE_ID = "11111111-1111-4111-8111-111111111111";
const RULE_ID = "22222222-2222-4222-8222-222222222222";
const RULE_ID_2 = "33333333-3333-4333-8333-333333333333";

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/auth", () => ({
  getAuthContext: getAuthContextMock,
  requireAdmin  : requireAdminMock
}));

vi.mock("@/server/modules/knowledge", () => ({
  listNerLexiconRules               : listNerLexiconRulesMock,
  createNerLexiconRule              : createNerLexiconRuleMock,
  updateNerLexiconRule              : updateNerLexiconRuleMock,
  deleteNerLexiconRule              : deleteNerLexiconRuleMock,
  reorderNerLexiconRules            : reorderNerLexiconRulesMock,
  batchDeleteNerLexiconRules        : batchDeleteNerLexiconRulesMock,
  batchToggleNerLexiconRules        : batchToggleNerLexiconRulesMock,
  batchChangeBookTypeNerLexiconRules: batchChangeBookTypeNerLexiconRulesMock
}));

describe("knowledge ner-rules routes", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers());
    getAuthContextMock.mockResolvedValue({ userId: "admin-1" });
    requireAdminMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    headersMock.mockReset();
    getAuthContextMock.mockReset();
    requireAdminMock.mockReset();
    listNerLexiconRulesMock.mockReset();
    createNerLexiconRuleMock.mockReset();
    updateNerLexiconRuleMock.mockReset();
    deleteNerLexiconRuleMock.mockReset();
    reorderNerLexiconRulesMock.mockReset();
    batchDeleteNerLexiconRulesMock.mockReset();
    batchToggleNerLexiconRulesMock.mockReset();
    batchChangeBookTypeNerLexiconRulesMock.mockReset();
    vi.resetModules();
  });

  it("lists and creates ner lexicon rules", async () => {
    listNerLexiconRulesMock.mockResolvedValueOnce([{ id: RULE_ID }]);
    createNerLexiconRuleMock.mockResolvedValueOnce({ id: RULE_ID });

    const { GET, POST } = await import("./route");

    const listResponse = await GET(new Request(`http://localhost/api/admin/knowledge/ner-rules?ruleType=HARD_BLOCK_SUFFIX&bookTypeId=${BOOK_TYPE_ID}`));

    expect(listResponse.status).toBe(200);
    expect(listNerLexiconRulesMock).toHaveBeenCalledWith({
      ruleType  : "HARD_BLOCK_SUFFIX",
      bookTypeId: BOOK_TYPE_ID
    });

    const createResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType  : "TITLE_STEM",
        content   : "大人",
        bookTypeId: BOOK_TYPE_ID,
        sortOrder : 2
      })
    }));

    expect(createResponse.status).toBe(201);
    expect(createNerLexiconRuleMock).toHaveBeenCalledWith({
      ruleType  : "TITLE_STEM",
      content   : "大人",
      bookTypeId: BOOK_TYPE_ID,
      sortOrder : 2
    });
  });

  it("updates deletes and reorders ner lexicon rules", async () => {
    updateNerLexiconRuleMock.mockResolvedValueOnce({ id: RULE_ID });
    deleteNerLexiconRuleMock.mockResolvedValueOnce({ id: RULE_ID });
    reorderNerLexiconRulesMock.mockResolvedValueOnce(undefined);

    const { PATCH, DELETE } = await import("./[id]/route");
    const { PUT } = await import("./reorder/route");

    const patchResponse = await PATCH(new Request(`http://localhost/api/admin/knowledge/ner-rules/${RULE_ID}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        content   : "老爷",
        bookTypeId: null,
        sortOrder : 3,
        isActive  : false
      })
    }), { params: Promise.resolve({ id: RULE_ID }) });

    expect(patchResponse.status).toBe(200);
    expect(updateNerLexiconRuleMock).toHaveBeenCalledWith(RULE_ID, {
      content   : "老爷",
      bookTypeId: null,
      sortOrder : 3,
      isActive  : false
    });

    const deleteResponse = await DELETE(new Request(`http://localhost/api/admin/knowledge/ner-rules/${RULE_ID}`, {
      method: "DELETE"
    }), { params: Promise.resolve({ id: RULE_ID }) });

    expect(deleteResponse.status).toBe(200);
    expect(deleteNerLexiconRuleMock).toHaveBeenCalledWith(RULE_ID);

    const reorderResponse = await PUT(new Request("http://localhost/api/admin/knowledge/ner-rules/reorder", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ orderedIds: [RULE_ID, RULE_ID_2] })
    }));

    expect(reorderResponse.status).toBe(200);
    expect(reorderNerLexiconRulesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2]);
  });

  it("dispatches ner lexicon batch actions", async () => {
    batchDeleteNerLexiconRulesMock.mockResolvedValueOnce({ count: 2 });
    batchToggleNerLexiconRulesMock
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 2 });
    batchChangeBookTypeNerLexiconRulesMock.mockResolvedValueOnce({ count: 2 });

    const { POST } = await import("./batch/route");

    const deleteResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "delete", ids: [RULE_ID, RULE_ID_2] })
    }));
    const enableResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "enable", ids: [RULE_ID, RULE_ID_2] })
    }));
    const disableResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "disable", ids: [RULE_ID, RULE_ID_2] })
    }));
    const changeResponse = await POST(new Request("http://localhost/api/admin/knowledge/ner-rules/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "changeBookType", ids: [RULE_ID, RULE_ID_2], bookTypeId: BOOK_TYPE_ID })
    }));

    expect(deleteResponse.status).toBe(200);
    expect(enableResponse.status).toBe(200);
    expect(disableResponse.status).toBe(200);
    expect(changeResponse.status).toBe(200);
    expect(batchDeleteNerLexiconRulesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2]);
    expect(batchToggleNerLexiconRulesMock).toHaveBeenNthCalledWith(1, [RULE_ID, RULE_ID_2], true);
    expect(batchToggleNerLexiconRulesMock).toHaveBeenNthCalledWith(2, [RULE_ID, RULE_ID_2], false);
    expect(batchChangeBookTypeNerLexiconRulesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2], BOOK_TYPE_ID);
  });
});
