import { afterEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import { ERROR_CODES } from "@/types/api";

const authenticateAdminMock = vi.fn();
const issueAuthTokenMock = vi.fn();
const sanitizeRedirectPathMock = vi.fn();
class MockAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}

vi.mock("@/server/modules/auth", () => ({
  AuthError               : MockAuthError,
  AUTH_COOKIE_NAME       : "token",
  AUTH_TOKEN_TTL_SECONDS : 604800,
  authenticateAdmin      : authenticateAdminMock,
  issueAuthToken         : issueAuthTokenMock,
  sanitizeRedirectPath   : sanitizeRedirectPathMock
}));

describe("POST /api/auth/login", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    authenticateAdminMock.mockReset();
    issueAuthTokenMock.mockReset();
    sanitizeRedirectPathMock.mockReset();
    vi.resetModules();

    if (typeof originalNodeEnv === "undefined") {
      Reflect.deleteProperty(process.env, "NODE_ENV");
      return;
    }

    Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
  });

  it("returns 200 and sets auth cookie on successful login", async () => {
    authenticateAdminMock.mockResolvedValue({
      id      : "user-1",
      username: "admin",
      email   : "admin@example.com",
      name    : "管理员",
      role    : AppRole.ADMIN
    });
    issueAuthTokenMock.mockReturnValue("signed-token");
    sanitizeRedirectPathMock.mockReturnValue("/admin/model?tab=models");

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body  : JSON.stringify({
        identifier: "admin@example.com",
        password  : "secret-123",
        redirect  : "/admin/model?tab=models"
      }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("AUTH_LOGGED_IN");
    expect(payload.message).toBe("登录成功");
    expect(payload.data).toEqual({
      redirect: "/admin/model?tab=models",
      user    : {
        id      : "user-1",
        username: "admin",
        email   : "admin@example.com",
        name    : "管理员",
        role    : AppRole.ADMIN
      }
    });

    expect(authenticateAdminMock).toHaveBeenCalledWith({
      identifier: "admin@example.com",
      password  : "secret-123"
    });

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("token=signed-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=604800");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toMatch(/samesite=lax/i);
  });

  it("accepts legacy identity field for backward compatibility", async () => {
    authenticateAdminMock.mockResolvedValue({
      id      : "user-1",
      username: "admin",
      email   : "admin@example.com",
      name    : "管理员",
      role    : AppRole.ADMIN
    });
    issueAuthTokenMock.mockReturnValue("signed-token");
    sanitizeRedirectPathMock.mockReturnValue("/admin/model");

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body  : JSON.stringify({
        identity: "admin@example.com",
        password: "secret-123",
        redirect: "/admin/model"
      }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(200);
    expect(authenticateAdminMock).toHaveBeenCalledWith({
      identifier: "admin@example.com",
      password  : "secret-123"
    });
  });

  it("returns 400 when request body validation fails", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body  : JSON.stringify({
        identifier: "",
        password  : ""
      }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.COMMON_BAD_REQUEST);
    expect(payload.error?.detail).toBe("请输入邮箱或用户名");
    expect(authenticateAdminMock).not.toHaveBeenCalled();
  });

  it("returns 401 when authentication fails", async () => {
    authenticateAdminMock.mockRejectedValue(
      new MockAuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误")
    );

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body  : JSON.stringify({
        identifier: "admin@example.com",
        password  : "wrong-password"
      }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
    expect(payload.message).toBe("账号或密码错误");
  });

  it("falls back to root when redirect is not an in-site path", async () => {
    authenticateAdminMock.mockResolvedValue({
      id      : "user-1",
      username: "admin",
      email   : "admin@example.com",
      name    : "管理员",
      role    : AppRole.ADMIN
    });
    issueAuthTokenMock.mockReturnValue("signed-token");
    sanitizeRedirectPathMock.mockReturnValue("/");

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body  : JSON.stringify({
        identifier: "admin@example.com",
        password  : "secret-123",
        redirect  : "https://evil.example"
      }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.data.redirect).toBe("/");
    expect(sanitizeRedirectPathMock).toHaveBeenCalledWith("https://evil.example");
  });
});
