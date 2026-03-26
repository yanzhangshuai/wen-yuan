import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const listMergeSuggestionsMock = vi.fn();

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  listMergeSuggestions          : listMergeSuggestionsMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const
}));

describe("GET /api/admin/merge-suggestions", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    listMergeSuggestionsMock.mockReset();
    vi.resetModules();
  });

  it("returns merge suggestion list", async () => {
    listMergeSuggestionsMock.mockResolvedValue([
      {
        id        : "b7b636b5-9a36-4e0a-8f0f-31a8eaa4845b",
        status    : "PENDING",
        sourceName: "范进",
        targetName: "周进"
      }
    ]);
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions?status=PENDING"));

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTIONS_LISTED");
    expect(listMergeSuggestionsMock).toHaveBeenCalledWith({ status: "PENDING" });
  });

  it("returns 403 when auth guard fails", async () => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.VIEWER }));
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions"));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("AUTH_FORBIDDEN");
  });

  it("returns 400 when query is invalid", async () => {
    const { GET } = await import("./route");

    const response = await GET(new Request("http://localhost/api/admin/merge-suggestions?status=INVALID"));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(listMergeSuggestionsMock).not.toHaveBeenCalled();
  });
});
