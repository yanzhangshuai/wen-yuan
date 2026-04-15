import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
const getAuthContextMock = vi.fn();
const requireAdminMock = vi.fn();
const listPromptExtractionRulesMock = vi.fn();
const createPromptExtractionRuleMock = vi.fn();
const updatePromptExtractionRuleMock = vi.fn();
const deletePromptExtractionRuleMock = vi.fn();
const reorderPromptExtractionRulesMock = vi.fn();
const previewCombinedPromptRulesMock = vi.fn();

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
  listPromptExtractionRules   : listPromptExtractionRulesMock,
  createPromptExtractionRule  : createPromptExtractionRuleMock,
  updatePromptExtractionRule  : updatePromptExtractionRuleMock,
  deletePromptExtractionRule  : deletePromptExtractionRuleMock,
  reorderPromptExtractionRules: reorderPromptExtractionRulesMock,
  previewCombinedPromptRules  : previewCombinedPromptRulesMock
}));

describe("knowledge prompt-extraction-rules routes", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers());
    getAuthContextMock.mockResolvedValue({ userId: "admin-1" });
    requireAdminMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    headersMock.mockReset();
    getAuthContextMock.mockReset();
    requireAdminMock.mockReset();
    listPromptExtractionRulesMock.mockReset();
    createPromptExtractionRuleMock.mockReset();
    updatePromptExtractionRuleMock.mockReset();
    deletePromptExtractionRuleMock.mockReset();
    reorderPromptExtractionRulesMock.mockReset();
    previewCombinedPromptRulesMock.mockReset();
    vi.resetModules();
  });

  it("lists and creates prompt extraction rules", async () => {
    listPromptExtractionRulesMock.mockResolvedValueOnce([{ id: RULE_ID }]);
    createPromptExtractionRuleMock.mockResolvedValueOnce({ id: RULE_ID });

    const { GET, POST } = await import("./route");

    const listResponse = await GET(new Request(`http://localhost/api/admin/knowledge/prompt-extraction-rules?ruleType=ENTITY&bookTypeId=${BOOK_TYPE_ID}`));

    expect(listResponse.status).toBe(200);
    expect(listPromptExtractionRulesMock).toHaveBeenCalledWith({
      ruleType  : "ENTITY",
      bookTypeId: BOOK_TYPE_ID
    });

    const createResponse = await POST(new Request("http://localhost/api/admin/knowledge/prompt-extraction-rules", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType  : "RELATIONSHIP",
        content   : "抽取师徒关系",
        bookTypeId: BOOK_TYPE_ID,
        sortOrder : 2
      })
    }));

    expect(createResponse.status).toBe(201);
    expect(createPromptExtractionRuleMock).toHaveBeenCalledWith({
      ruleType  : "RELATIONSHIP",
      content   : "抽取师徒关系",
      bookTypeId: BOOK_TYPE_ID,
      sortOrder : 2
    });
  });

  it("updates deletes reorders and previews prompt extraction rules", async () => {
    updatePromptExtractionRuleMock.mockResolvedValueOnce({ id: RULE_ID });
    deletePromptExtractionRuleMock.mockResolvedValueOnce({ id: RULE_ID });
    reorderPromptExtractionRulesMock.mockResolvedValueOnce(undefined);
    previewCombinedPromptRulesMock.mockResolvedValueOnce({ count: 2, combined: "1. 规则一\n2. 规则二" });

    const { PATCH, DELETE } = await import("./[id]/route");
    const { PUT } = await import("./reorder/route");
    const { POST } = await import("./preview-combined/route");

    const patchResponse = await PATCH(new Request(`http://localhost/api/admin/knowledge/prompt-extraction-rules/${RULE_ID}`, {
      method : "PATCH",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        content   : "抽取主角",
        bookTypeId: null,
        sortOrder : 3,
        isActive  : false
      })
    }), { params: Promise.resolve({ id: RULE_ID }) });

    expect(patchResponse.status).toBe(200);
    expect(updatePromptExtractionRuleMock).toHaveBeenCalledWith(RULE_ID, {
      content   : "抽取主角",
      bookTypeId: null,
      sortOrder : 3,
      isActive  : false
    });

    const deleteResponse = await DELETE(new Request(`http://localhost/api/admin/knowledge/prompt-extraction-rules/${RULE_ID}`, {
      method: "DELETE"
    }), { params: Promise.resolve({ id: RULE_ID }) });

    expect(deleteResponse.status).toBe(200);
    expect(deletePromptExtractionRuleMock).toHaveBeenCalledWith(RULE_ID);

    const reorderResponse = await PUT(new Request("http://localhost/api/admin/knowledge/prompt-extraction-rules/reorder", {
      method : "PUT",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ orderedIds: [RULE_ID, RULE_ID_2] })
    }));

    expect(reorderResponse.status).toBe(200);
    expect(reorderPromptExtractionRulesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2]);

    const previewResponse = await POST(new Request("http://localhost/api/admin/knowledge/prompt-extraction-rules/preview-combined", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({
        ruleType  : "ENTITY",
        bookTypeId: BOOK_TYPE_ID
      })
    }));

    expect(previewResponse.status).toBe(200);
    expect(previewCombinedPromptRulesMock).toHaveBeenCalledWith("ENTITY", BOOK_TYPE_ID);
  });
});
