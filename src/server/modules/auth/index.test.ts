/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务的输入校验、分支处理和输出映射契约。
 * - 该层是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 约束状态流转和数据边界，避免误改导致上游页面行为漂移。
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import { ERROR_CODES } from "@/types/api";

import {
  AuthError,
  AUTH_ADMIN_ROLE,
  AUTH_TOKEN_TTL_SECONDS,
  AUTH_VIEWER_ROLE,
  authenticateAdmin,
  getAuthContext,
  issueAuthToken,
  requireAdmin,
  sanitizeRedirectPath,
  verifyAuthToken
} from "./index";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("auth role constants", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps auth role constants aligned with prisma enum values", () => {
    expect(AUTH_ADMIN_ROLE).toBe(AppRole.ADMIN);
    expect(AUTH_VIEWER_ROLE).toBe(AppRole.VIEWER);
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("getAuthContext", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "unit-test-secret-at-least-32-bytes!!";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maps injected admin headers to admin context", async () => {
    const headers = new Headers({
      "x-auth-role"   : AppRole.ADMIN,
      "x-auth-user-id": "user-1"
    });

    await expect(getAuthContext(headers)).resolves.toEqual({
      userId         : "user-1",
      role           : AppRole.ADMIN,
      name           : null,
      isAuthenticated: true
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to viewer when role header is missing", async () => {
    await expect(getAuthContext(new Headers())).resolves.toEqual({
      userId         : null,
      role           : AppRole.VIEWER,
      name           : null,
      isAuthenticated: false
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves admin from cookie token when middleware headers are missing", async () => {
    process.env.JWT_SECRET = testSecret;
    const now = Math.floor(Date.now() / 1000);
    const token = await issueAuthToken("管理员", now);
    const headers = new Headers({
      cookie: `token=${token}`
    });

    await expect(getAuthContext(headers)).resolves.toEqual({
      userId         : null,
      role           : AppRole.ADMIN,
      name           : "管理员",
      isAuthenticated: true
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("prefers valid cookie token when middleware role header is viewer", async () => {
    process.env.JWT_SECRET = testSecret;
    const now = Math.floor(Date.now() / 1000);
    const token = await issueAuthToken("管理员", now);
    const headers = new Headers({
      "x-auth-role": AppRole.VIEWER,
      cookie       : `token=${token}`
    });

    await expect(getAuthContext(headers)).resolves.toEqual({
      userId         : null,
      role           : AppRole.ADMIN,
      name           : "管理员",
      isAuthenticated: true
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps viewer when cookie token is invalid", async () => {
    process.env.JWT_SECRET = testSecret;
    const headers = new Headers({
      cookie: "token=bad-token"
    });

    await expect(getAuthContext(headers)).resolves.toEqual({
      userId         : null,
      role           : AppRole.VIEWER,
      name           : null,
      isAuthenticated: false
    });
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("requireAdmin", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("allows admin role without throwing", () => {
    expect(() => requireAdmin({ userId: "user-1", role: AppRole.ADMIN, name: "管理员", isAuthenticated: true })).not.toThrow();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws forbidden when current role is viewer", () => {
    expect(() => requireAdmin({ userId: null, role: AppRole.VIEWER, name: null, isAuthenticated: false })).toThrowError(
      new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "当前用户没有管理员权限")
    );
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("sanitizeRedirectPath", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to root when redirect is nullish", () => {
    expect(sanitizeRedirectPath(null)).toBe("/");
    expect(sanitizeRedirectPath(undefined)).toBe("/");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("keeps in-site path and query", () => {
    expect(sanitizeRedirectPath("/admin/model?tab=keys")).toBe("/admin/model?tab=keys");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("falls back to root when redirect is unsafe", () => {
    expect(sanitizeRedirectPath("https://evil.example")).toBe("/");
    expect(sanitizeRedirectPath("//evil.example")).toBe("/");
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("auth token", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "unit-test-secret-at-least-32-bytes!!";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("issues a signed admin token with 7 day ttl", async () => {
    process.env.JWT_SECRET = testSecret;

    const token = await issueAuthToken("管理员", 1_700_000_000);
    const payload = await verifyAuthToken(token, 1_700_000_100);

    expect(payload).toEqual({
      role: AppRole.ADMIN,
      name: "管理员",
      iat : 1_700_000_000,
      exp : 1_700_000_000 + AUTH_TOKEN_TTL_SECONDS
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("rejects tampered or expired tokens", async () => {
    process.env.JWT_SECRET = testSecret;

    const token = await issueAuthToken("管理员", 1_700_000_000);
    const tampered = `${token.slice(0, -1)}x`;

    await expect(verifyAuthToken(tampered, 1_700_000_100)).resolves.toBeNull();
    await expect(
      verifyAuthToken(token, 1_700_000_000 + AUTH_TOKEN_TTL_SECONDS + 1)
    ).resolves.toBeNull();
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("authenticateAdmin", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
          role    : AppRole.ADMIN,
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
      role    : AppRole.ADMIN
    });
    expect(update).toHaveBeenCalledOnce();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws unified unauthorized error when password is wrong", async () => {
    const prismaClient = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id      : "user-1",
          username: "admin",
          email   : "admin@example.com",
          name    : "管理员",
          password: await (await import("./password")).hashPassword("secret-123"),
          role    : AppRole.ADMIN,
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

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws unified unauthorized error when user is not admin role", async () => {
    const prismaClient = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id      : "user-2",
          username: "viewer-user",
          email   : "viewer@example.com",
          name    : "只读用户",
          password: await (await import("./password")).hashPassword("secret-123"),
          role    : AppRole.VIEWER,
          isActive: true
        }),
        update: vi.fn()
      }
    } as never;

    await expect(
      authenticateAdmin({ identifier: "viewer@example.com", password: "secret-123" }, prismaClient)
    ).rejects.toMatchObject({
      code   : ERROR_CODES.AUTH_UNAUTHORIZED,
      message: "账号或密码错误"
    });
  });
});
