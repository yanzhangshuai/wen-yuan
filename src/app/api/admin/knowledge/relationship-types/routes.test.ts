import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const headersMock = vi.fn();
const getAuthContextMock = vi.fn();
const requireAdminMock = vi.fn();
const batchDeleteRelationshipTypesMock = vi.fn();
const batchUpdateRelationshipTypeStatusMock = vi.fn();
const batchChangeRelationshipTypeGroupMock = vi.fn();

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
  batchDeleteRelationshipTypes     : batchDeleteRelationshipTypesMock,
  batchUpdateRelationshipTypeStatus: batchUpdateRelationshipTypeStatusMock,
  batchChangeRelationshipTypeGroup : batchChangeRelationshipTypeGroupMock
}));

describe("knowledge relationship-types batch route", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers());
    getAuthContextMock.mockResolvedValue({ userId: "admin-1" });
    requireAdminMock.mockReturnValue(undefined);
  });

  afterEach(() => {
    headersMock.mockReset();
    getAuthContextMock.mockReset();
    requireAdminMock.mockReset();
    batchDeleteRelationshipTypesMock.mockReset();
    batchUpdateRelationshipTypeStatusMock.mockReset();
    batchChangeRelationshipTypeGroupMock.mockReset();
    vi.resetModules();
  });

  it("dispatches relationship type batch actions", async () => {
    batchDeleteRelationshipTypesMock.mockResolvedValueOnce({ count: 2 });
    batchUpdateRelationshipTypeStatusMock
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 2 });
    batchChangeRelationshipTypeGroupMock.mockResolvedValueOnce({ count: 2 });

    const { POST } = await import("./batch/route");

    const deleteResponse = await POST(new Request("http://localhost/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "delete", ids: [RULE_ID, RULE_ID_2] })
    }));
    const enableResponse = await POST(new Request("http://localhost/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "enable", ids: [RULE_ID, RULE_ID_2] })
    }));
    const disableResponse = await POST(new Request("http://localhost/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "disable", ids: [RULE_ID, RULE_ID_2] })
    }));
    const pendingResponse = await POST(new Request("http://localhost/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "markPendingReview", ids: [RULE_ID, RULE_ID_2] })
    }));
    const groupResponse = await POST(new Request("http://localhost/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "changeGroup", ids: [RULE_ID, RULE_ID_2], group: "姻亲" })
    }));

    expect(deleteResponse.status).toBe(200);
    expect(enableResponse.status).toBe(200);
    expect(disableResponse.status).toBe(200);
    expect(pendingResponse.status).toBe(200);
    expect(groupResponse.status).toBe(200);
    expect(batchDeleteRelationshipTypesMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2]);
    expect(batchUpdateRelationshipTypeStatusMock).toHaveBeenNthCalledWith(1, [RULE_ID, RULE_ID_2], "ACTIVE");
    expect(batchUpdateRelationshipTypeStatusMock).toHaveBeenNthCalledWith(2, [RULE_ID, RULE_ID_2], "INACTIVE");
    expect(batchUpdateRelationshipTypeStatusMock).toHaveBeenNthCalledWith(3, [RULE_ID, RULE_ID_2], "PENDING_REVIEW");
    expect(batchChangeRelationshipTypeGroupMock).toHaveBeenCalledWith([RULE_ID, RULE_ID_2], "姻亲");
  });

  it("rejects invalid relationship type batch payloads", async () => {
    const { POST } = await import("./batch/route");

    const response = await POST(new Request("http://localhost/api/admin/knowledge/relationship-types/batch", {
      method : "POST",
      headers: { "Content-Type": "application/json" },
      body   : JSON.stringify({ action: "enable", ids: [] })
    }));

    expect(response.status).toBe(400);
    expect(batchUpdateRelationshipTypeStatusMock).not.toHaveBeenCalled();
  });
});
