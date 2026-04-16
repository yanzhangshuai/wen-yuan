import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
const getAuthContextMock = vi.fn();
const requireAdminMock = vi.fn();
const batchDeleteSurnamesMock = vi.fn();
const batchToggleSurnamesMock = vi.fn();
const batchChangeBookTypeSurnamesMock = vi.fn();

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
  batchDeleteSurnames        : batchDeleteSurnamesMock,
  batchToggleSurnames        : batchToggleSurnamesMock,
  batchChangeBookTypeSurnames: batchChangeBookTypeSurnamesMock
}));

describe("knowledge surnames batch route", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers());
    getAuthContextMock.mockResolvedValue({ userId: "admin-1" });
    requireAdminMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    headersMock.mockReset();
    getAuthContextMock.mockReset();
    requireAdminMock.mockReset();
    batchDeleteSurnamesMock.mockReset();
    batchToggleSurnamesMock.mockReset();
    batchChangeBookTypeSurnamesMock.mockReset();
    vi.resetModules();
  });

  it("dispatches surname batch actions", async () => {
    batchDeleteSurnamesMock.mockResolvedValueOnce({ count: 2 });
    batchToggleSurnamesMock
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 2 });
    batchChangeBookTypeSurnamesMock.mockResolvedValueOnce({ count: 2 });

    const { POST } = await import("./batch/route");

    const deleteResponse = await POST(new Request("http://localhost/api/admin/knowledge/surnames/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "delete", ids: [RULE_ID, RULE_ID_2] })
    }));
    const enableResponse = await POST(new Request("http://localhost/api/admin/knowledge/surnames/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "enable", ids: [RULE_ID, RULE_ID_2] })
    }));
    const disableResponse = await POST(new Request("http://localhost/api/admin/knowledge/surnames/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "disable", ids: [RULE_ID, RULE_ID_2] })
    }));
    const changeResponse = await POST(new Request("http://localhost/api/admin/knowledge/surnames/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "changeBookType", ids: [RULE_ID, RULE_ID_2], bookTypeId: BOOK_TYPE_ID })
    }));

    expect(deleteResponse.status).toBe(200);
    expect(enableResponse.status).toBe(200);
    expect(disableResponse.status).toBe(200);
    expect(changeResponse.status).toBe(200);
    expect(batchDeleteSurnamesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2]);
    expect(batchToggleSurnamesMock).toHaveBeenNthCalledWith(1, [RULE_ID, RULE_ID_2], true);
    expect(batchToggleSurnamesMock).toHaveBeenNthCalledWith(2, [RULE_ID, RULE_ID_2], false);
    expect(batchChangeBookTypeSurnamesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2], BOOK_TYPE_ID);
  });

  it("rejects invalid surname batch payloads", async () => {
    const { POST } = await import("./batch/route");

    const response = await POST(new Request("http://localhost/api/admin/knowledge/surnames/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "enable", ids: [] })
    }));

    expect(response.status).toBe(400);
    expect(batchToggleSurnamesMock).not.toHaveBeenCalled();
  });
});
