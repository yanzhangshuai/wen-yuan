import { describe, expect, it } from "vitest";

import { ERROR_CODES } from "@/types/api";

import { failJson, parsePagination } from "./route-utils";
import { AuthError } from "../modules/auth";

/**
 * 路由工具直接决定分页容错和 API 错误响应格式。
 * 这些测试用于锁定公共行为，避免后续重构影响所有 HTTP handler。
 */
describe("parsePagination", () => {
  it("uses defaults when params are missing", () => {
    // Arrange
    const params = new URLSearchParams();

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  it("normalizes invalid values and floors decimals", () => {
    // Arrange
    const params = new URLSearchParams({
      page     : "-2",
      page_size: "0"
    });

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 1, pageSize: 20 });
  });

  it("clamps page_size to 100 and floors numbers", () => {
    // Arrange
    const params = new URLSearchParams({
      page     : "2.8",
      page_size: "200.9"
    });

    // Act
    const pagination = parsePagination(params);

    // Assert
    expect(pagination).toEqual({ page: 2, pageSize: 100 });
  });
});

describe("failJson", () => {
  const commonArgs = {
    path     : "/api/analyze",
    requestId: "req-1",
    startedAt: Date.now() - 12
  };

  it("maps unauthorized auth error to 401", async () => {
    // Act
    const response = failJson({
      ...commonArgs,
      error: new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "missing")
    });

    // Assert
    expect(response.status).toBe(401);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
    expect(payload.error?.type).toBe("AuthError");
  });

  it("maps non-auth errors to 500 with fallback code", async () => {
    // Act
    const response = failJson({
      ...commonArgs,
      error          : new Error("boom"),
      fallbackCode   : ERROR_CODES.COMMON_INTERNAL_ERROR,
      fallbackMessage: "internal"
    });

    // Assert
    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.COMMON_INTERNAL_ERROR);
    expect(payload.message).toBe("internal");
    expect(payload.error?.detail).toBe("boom");
  });
});
