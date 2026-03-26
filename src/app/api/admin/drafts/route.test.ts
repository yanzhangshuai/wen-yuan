import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listAdminDraftsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/listDrafts", () => ({
  REVIEW_DRAFT_TAB_VALUES: ["PERSONA", "RELATIONSHIP", "BIOGRAPHY"] as const,
  listAdminDrafts        : listAdminDraftsMock
}));

describe("GET /api/admin/drafts", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listAdminDraftsMock.mockReset();
    vi.resetModules();
  });

  it("returns admin drafts with filter", async () => {
    listAdminDraftsMock.mockResolvedValue({
      summary: {
        persona     : 1,
        relationship: 2,
        biography   : 3,
        total       : 6
      },
      personas        : [],
      relationships   : [],
      biographyRecords: []
    });
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/drafts?tab=RELATIONSHIP&source=AI")
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_DRAFTS_LISTED");
    expect(listAdminDraftsMock).toHaveBeenCalledWith({
      tab   : "RELATIONSHIP",
      source: "AI"
    });
  });

  it("returns 400 when query is invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(
      new Request("http://localhost/api/admin/drafts?tab=INVALID")
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(listAdminDraftsMock).not.toHaveBeenCalled();
  });

  it("returns 403 when user is viewer", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/drafts"));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
  });
});
