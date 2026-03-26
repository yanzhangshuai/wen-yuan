import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const rejectMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  rejectMergeSuggestion         : rejectMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError
}));

describe("POST /api/admin/merge-suggestions/:id/reject", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    rejectMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("rejects merge suggestion", async () => {
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
    rejectMergeSuggestionMock.mockResolvedValue({
      id    : suggestionId,
      status: "REJECTED"
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
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTION_REJECTED");
    expect(rejectMergeSuggestionMock).toHaveBeenCalledWith(suggestionId);
  });

  it("returns 404 when suggestion does not exist", async () => {
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
    rejectMergeSuggestionMock.mockRejectedValue(new MergeSuggestionNotFoundError("not found"));
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
    const suggestionId = "4c7c48b7-7801-4388-ad5f-265d14f2458d";
    rejectMergeSuggestionMock.mockRejectedValue(new MergeSuggestionStateError("invalid state"));
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
    expect(rejectMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
