import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const deferMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  deferMergeSuggestion          : deferMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

describe("POST /api/admin/merge-suggestions/:id/defer", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    deferMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("defers merge suggestion", async () => {
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
    deferMergeSuggestionMock.mockResolvedValue({
      id    : suggestionId,
      status: "DEFERRED"
    });
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(200);
    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTION_DEFERRED");
    expect(deferMergeSuggestionMock).toHaveBeenCalledWith(suggestionId);
  });

  it("returns 404 when suggestion does not exist", async () => {
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
    deferMergeSuggestionMock.mockRejectedValue(new MergeSuggestionNotFoundError("not found"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(404);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_NOT_FOUND");
  });

  it("returns 409 when suggestion status cannot be changed", async () => {
    const suggestionId = "5f08f368-f342-4f3a-9db6-b8facf48afec";
    deferMergeSuggestionMock.mockRejectedValue(new MergeSuggestionStateError("invalid state"));
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: suggestionId })
      }
    );

    expect(response.status).toBe(409);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
  });

  it("returns 400 when params are invalid", async () => {
    const { POST } = await import("./route");

    const response = await POST(
      new Request("http://localhost/api/admin/merge-suggestions"),
      {
        params: Promise.resolve({ id: "invalid-id" })
      }
    );

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_BAD_REQUEST");
    expect(deferMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
