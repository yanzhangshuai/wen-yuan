import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole, ProcessingStatus } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const bulkVerifyDraftsMock = vi.fn();
class BulkReviewInputError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/bulkReview", () => ({
  bulkVerifyDrafts: bulkVerifyDraftsMock,
  BulkReviewInputError
}));

describe("POST /api/admin/bulk-verify", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    bulkVerifyDraftsMock.mockReset();
    vi.resetModules();
  });

  it("bulk verifies drafts", async () => {
    bulkVerifyDraftsMock.mockResolvedValue({
      ids                 : ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"],
      status              : ProcessingStatus.VERIFIED,
      relationshipCount   : 2,
      biographyRecordCount: 1,
      totalCount          : 3
    });
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_DRAFTS_BULK_VERIFIED");
    expect(bulkVerifyDraftsMock).toHaveBeenCalledWith(["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]);
  });

  it("returns 403 when viewer calls the API", async () => {
    headersMock.mockResolvedValueOnce(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(403);
    expect(bulkVerifyDraftsMock).not.toHaveBeenCalled();
  });

  it("redirects to login when middleware headers and auth cookie are both missing", async () => {
    headersMock.mockResolvedValueOnce(new Headers());
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify?bookId=book-1", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fapi%2Fadmin%2Fbulk-verify%3FbookId%3Dbook-1"
    );
    expect(bulkVerifyDraftsMock).not.toHaveBeenCalled();
  });

  it("returns 400 when body is invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["invalid-id"]
      })
    }));

    expect(response.status).toBe(400);
    expect(bulkVerifyDraftsMock).not.toHaveBeenCalled();
  });

  it("maps service input error to 400", async () => {
    bulkVerifyDraftsMock.mockRejectedValue(new BulkReviewInputError("至少需要传入一个草稿 ID"));
    const { POST } = await import("./route");

    const response = await POST(new Request("http://localhost/api/admin/bulk-verify", {
      method : "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify({
        ids: ["8f53a01e-a9b4-420c-a55d-f4f1452f52bc"]
      })
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });
});
