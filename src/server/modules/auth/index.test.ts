import { afterEach, describe, expect, it, vi } from "vitest";

import { ERROR_CODES } from "@/types/api";

import {
  AuthError,
  AUTH_TOKEN_TTL_SECONDS,
  authenticateAdmin,
  getAuthContext,
  issueAuthToken,
  requireAdmin,
  sanitizeRedirectPath,
  verifyAuthToken
} from "./index";

describe("getAuthContext", () => {
  it("maps injected admin headers to admin context", () => {
    const headers = new Headers({
      "x-auth-role"   : "admin",
      "x-auth-user-id": "user-1"
    });

    expect(getAuthContext(headers)).toEqual({
      userId: "user-1",
      role  : "admin"
    });
  });

  it("falls back to viewer when role header is missing", () => {
    expect(getAuthContext(new Headers())).toEqual({
      userId: null,
      role  : "viewer"
    });
  });
});

describe("requireAdmin", () => {
  it("throws forbidden when current role is viewer", () => {
    expect(() => requireAdmin({ userId: null, role: "viewer" })).toThrowError(
      new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "当前用户没有管理员权限")
    );
  });
});

describe("sanitizeRedirectPath", () => {
  it("keeps in-site path and query", () => {
    expect(sanitizeRedirectPath("/admin/model?tab=keys")).toBe("/admin/model?tab=keys");
  });

  it("falls back to root when redirect is unsafe", () => {
    expect(sanitizeRedirectPath("https://evil.example")).toBe("/");
    expect(sanitizeRedirectPath("//evil.example")).toBe("/");
  });
});

describe("auth token", () => {
  const originalSecret = process.env.JWT_SECRET;

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("issues a signed admin token with 7 day ttl", () => {
    process.env.JWT_SECRET = "unit-test-secret";

    const token = issueAuthToken(1_700_000_000);
    const payload = verifyAuthToken(token, 1_700_000_100);

    expect(payload).toEqual({
      role: "admin",
      iat : 1_700_000_000,
      exp : 1_700_000_000 + AUTH_TOKEN_TTL_SECONDS
    });
  });

  it("rejects tampered or expired tokens", () => {
    process.env.JWT_SECRET = "unit-test-secret";

    const token = issueAuthToken(1_700_000_000);
    const tampered = `${token.slice(0, -1)}x`;

    expect(verifyAuthToken(tampered, 1_700_000_100)).toBeNull();
    expect(verifyAuthToken(token, 1_700_000_000 + AUTH_TOKEN_TTL_SECONDS + 1)).toBeNull();
  });
});

describe("authenticateAdmin", () => {
  it("returns admin user when identifier and password match", async () => {
    const update = vi.fn().mockResolvedValue(undefined);
    const prismaClient = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id      : "user-1",
          username: "admin",
          email   : "admin@example.com",
          name    : "管理员",
          password: await (await import("./password")).hashPassword("secret-123"),
          role    : "ADMIN",
          isActive: true
        }),
        update
      }
    } as never;

    const result = await authenticateAdmin(
      { identifier: "admin@example.com", password: "secret-123" },
      prismaClient
    );

    expect(result).toEqual({
      id      : "user-1",
      username: "admin",
      email   : "admin@example.com",
      name    : "管理员",
      role    : "admin"
    });
    expect(update).toHaveBeenCalledOnce();
  });

  it("throws unified unauthorized error when password is wrong", async () => {
    const prismaClient = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id      : "user-1",
          username: "admin",
          email   : "admin@example.com",
          name    : "管理员",
          password: await (await import("./password")).hashPassword("secret-123"),
          role    : "ADMIN",
          isActive: true
        }),
        update: vi.fn()
      }
    } as never;

    await expect(
      authenticateAdmin({ identifier: "admin@example.com", password: "wrong-password" }, prismaClient)
    ).rejects.toMatchObject({
      code   : ERROR_CODES.AUTH_UNAUTHORIZED,
      message: "账号或密码错误"
    });
  });
});
