import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/types/api";

import { failJson, parsePagination } from "./route-utils";
import { AuthError } from "../modules/auth/rbac";

describe("parsePagination", () => {
  it("uses defaults when params are missing", () => {
    const pagination = parsePagination(new URLSearchParams());
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  it("normalizes invalid values and floors decimals", () => {
    const pagination = parsePagination(
      new URLSearchParams({
        page: "-2",
        page_size: "0"
      })
    );

    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });
E
  it("clamps page_size to 100 and floors numbers", () => {
    const pagination = parsePagination(
      new URLSearchParams({
        page: "2.8",
        page_size: "200.9"
      })
    );

    expect(pagination).toEqual({ page: 2, pageSize: 100 });
  });
});

describe("failJson", () => {
  const commonArgs = {
    path: "/api/analyze",
    requestId: "req-1",
    startedAt: Date.now() - 12
  };

  it("maps unauthorized auth error to 401", async () => {
    const response = failJson({
      ...commonArgs,
      error: new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "missing")
    });

    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
    expect(payload.error?.type).toBe("AuthError");
  });

  it("maps non-auth errors to 500 with fallback code", async () => {
    const response = failJson({
      ...commonArgs,
      error: new Error("boom"),
      fallbackCode: ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "internal"
    });

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.COMMON_INTERNAL_ERROR);
    expect(payload.message).toBe("internal");
    expect(payload.error?.detail).toBe("boom");
  });
});
