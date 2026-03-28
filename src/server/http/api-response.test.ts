import { afterEach, describe, expect, it, vi } from "vitest";

import { createApiMeta, errorResponse, successResponse, toNextJson } from "@/server/http/api-response";

describe("api-response", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates api meta with request id/path and computed duration", () => {
    vi.spyOn(Date, "now").mockReturnValue(1_700_000_000_120);

    const meta = createApiMeta("/api/books", "req-1", 1_700_000_000_000);

    expect(meta.requestId).toBe("req-1");
    expect(meta.path).toBe("/api/books");
    expect(meta.durationMs).toBe(120);
    expect(Number.isNaN(Date.parse(meta.timestamp))).toBe(false);
  });

  it("returns success envelope payload", () => {
    const payload = successResponse(
      "BOOK_CREATED",
      "created",
      { id: "book-1" },
      {
        requestId : "req-2",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 8
      }
    );

    expect(payload).toEqual({
      success: true,
      code   : "BOOK_CREATED",
      message: "created",
      data   : { id: "book-1" },
      meta   : {
        requestId : "req-2",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 8
      }
    });
  });

  it("returns error envelope payload", () => {
    const payload = errorResponse(
      "COMMON_BAD_REQUEST",
      "invalid",
      {
        type  : "ValidationError",
        detail: "title is required"
      },
      {
        requestId : "req-3",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 3
      }
    );

    expect(payload).toEqual({
      success: false,
      code   : "COMMON_BAD_REQUEST",
      message: "invalid",
      error  : {
        type  : "ValidationError",
        detail: "title is required"
      },
      meta: {
        requestId : "req-3",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/books",
        durationMs: 3
      }
    });
  });

  it("serializes success payload to NextResponse JSON with status", async () => {
    const response = toNextJson(successResponse(
      "OK",
      "done",
      { ok: true },
      {
        requestId : "req-4",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/ping",
        durationMs: 1
      }
    ), 201);

    expect(response.status).toBe(201);
    expect(response.headers.get("content-type")).toContain("application/json");

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("OK");
    expect(payload.meta.requestId).toBe("req-4");
  });

  it("serializes error payload to NextResponse JSON with status", async () => {
    const response = toNextJson(errorResponse(
      "COMMON_INTERNAL_ERROR",
      "failed",
      {
        type  : "InternalError",
        detail: "boom"
      },
      {
        requestId : "req-5",
        timestamp : "2026-03-27T00:00:00.000Z",
        path      : "/api/ping",
        durationMs: 9
      }
    ), 500);

    expect(response.status).toBe(500);

    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe("COMMON_INTERNAL_ERROR");
    expect(payload.error.type).toBe("InternalError");
  });
});
