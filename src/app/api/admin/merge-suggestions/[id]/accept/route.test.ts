import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";

const headersMock = vi.fn();
const acceptMergeSuggestionMock = vi.fn();
class MergeSuggestionNotFoundError extends Error {}
class MergeSuggestionStateError extends Error {}
class PersonaMergeConflictError extends Error {}

vi.mock("next/headers", () => ({
  headers: headersMock
}));

vi.mock("@/server/modules/review/mergeSuggestions", () => ({
  acceptMergeSuggestion         : acceptMergeSuggestionMock,
  MERGE_SUGGESTION_STATUS_VALUES: ["PENDING", "ACCEPTED", "REJECTED", "DEFERRED"] as const,
  MergeSuggestionNotFoundError,
  MergeSuggestionStateError,
  PersonaMergeConflictError
}));

describe("POST /api/admin/merge-suggestions/:id/accept", () => {
  beforeEach(() => {
    headersMock.mockResolvedValue(new Headers({ "x-auth-role": AppRole.ADMIN }));
  });

  afterEach(() => {
    headersMock.mockReset();
    acceptMergeSuggestionMock.mockReset();
    vi.resetModules();
  });

  it("accepts merge suggestion", async () => {
    const suggestionId = "e23d523f-0e66-4fb4-b475-d57f86886d9f";
    acceptMergeSuggestionMock.mockResolvedValue({
      id    : suggestionId,
      status: "ACCEPTED"
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
    expect(payload.code).toBe("ADMIN_MERGE_SUGGESTION_ACCEPTED");
    expect(acceptMergeSuggestionMock).toHaveBeenCalledWith(suggestionId);
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
    expect(acceptMergeSuggestionMock).not.toHaveBeenCalled();
  });
});
