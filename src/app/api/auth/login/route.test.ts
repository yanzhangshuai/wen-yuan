/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 本文件对应 app/ 目录下的 route.ts（或其动态路由变体）测试，验证接口层契约是否稳定。
 * - 在 Next.js 中，route.ts 由文件系统路由自动注册为 HTTP 接口；本测试通过直接调用导出的 HTTP 方法函数复现服务端执行语义。
 *
 * 业务职责：
 * - 约束请求参数校验、鉴权分支、服务层调用参数、错误码映射、统一响应包结构。
 * - 保护上下游协作边界：上游是浏览器/管理端请求，下游是各领域 service 与数据访问层。
 *
 * 维护注意：
 * - 这是接口契约测试，断言字段和状态码属于外部约定，不能随意改动。
 * - 若未来调整路由/错误码，请同步更新前端调用方与文档，否则会造成线上联调回归。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import { ERROR_CODES } from "@/types/api";

const authenticateAdminMock = vi.fn();
const issueAuthTokenMock = vi.fn();
const sanitizeRedirectPathMock = vi.fn();
const resolveClientIpMock = vi.fn();
const getLoginLockRetryAfterSecondsMock = vi.fn();
const recordLoginFailureMock = vi.fn();
const clearLoginFailuresMock = vi.fn();
class MockAuthError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}

vi.mock("@/server/modules/auth", () => ({
  AuthError             : MockAuthError,
  AUTH_COOKIE_NAME      : "token",
  AUTH_TOKEN_TTL_SECONDS: 604800,
  authenticateAdmin     : authenticateAdminMock,
  issueAuthToken        : issueAuthTokenMock,
  sanitizeRedirectPath  : sanitizeRedirectPathMock
}));

vi.mock("@/server/modules/auth/login-rate-limit", () => ({
  resolveClientIp              : resolveClientIpMock,
  getLoginLockRetryAfterSeconds: getLoginLockRetryAfterSecondsMock,
  recordLoginFailure           : recordLoginFailureMock,
  clearLoginFailures           : clearLoginFailuresMock
}));

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("POST /api/auth/login", () => {
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    resolveClientIpMock.mockReturnValue("203.0.113.1");
    getLoginLockRetryAfterSecondsMock.mockReturnValue(null);
    recordLoginFailureMock.mockReturnValue({
      locked           : false,
      retryAfterSeconds: null
    });
  });

  afterEach(() => {
    authenticateAdminMock.mockReset();
    issueAuthTokenMock.mockReset();
    sanitizeRedirectPathMock.mockReset();
    resolveClientIpMock.mockReset();
    getLoginLockRetryAfterSecondsMock.mockReset();
    recordLoginFailureMock.mockReset();
    clearLoginFailuresMock.mockReset();
    vi.resetModules();

    if (typeof originalNodeEnv === "undefined") {
      Reflect.deleteProperty(process.env, "NODE_ENV");
      return;
    }

    Reflect.set(process.env, "NODE_ENV", originalNodeEnv);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
        "content-type": "application/json",
        origin        : "http://localhost"
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
    expect(issueAuthTokenMock).toHaveBeenCalledWith("管理员");
    expect(clearLoginFailuresMock).toHaveBeenCalledWith("203.0.113.1");
    expect(resolveClientIpMock).toHaveBeenCalledOnce();

    const setCookie = response.headers.get("set-cookie");
    expect(setCookie).toContain("token=signed-token");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toContain("Max-Age=604800");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toMatch(/samesite=strict/i);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when request body validation fails", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method: "POST",
      body  : JSON.stringify({
        identifier: "",
        password  : ""
      }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(400);

    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.COMMON_BAD_REQUEST);
    expect(payload.error?.detail).toBe("请输入邮箱或用户名");
    expect(authenticateAdminMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(401);

    const payload = await response.json();
    expect(payload.success).toBe(false);
    expect(payload.code).toBe(ERROR_CODES.AUTH_UNAUTHORIZED);
    expect(payload.message).toBe("账号或密码错误");
    expect(recordLoginFailureMock).toHaveBeenCalledWith("203.0.113.1");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
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
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.data.redirect).toBe("/");
    expect(sanitizeRedirectPathMock).toHaveBeenCalledWith("https://evil.example");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when origin header is missing", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.AUTH_FORBIDDEN);
    expect(authenticateAdminMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when origin host mismatches request host", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://evil.example"
      }
    }));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.AUTH_FORBIDDEN);
    expect(payload.message).toBe("非法请求来源");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 when origin is malformed", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json",
        origin        : "://bad-origin"
      }
    }));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.AUTH_FORBIDDEN);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 429 immediately when ip is already locked", async () => {
    getLoginLockRetryAfterSecondsMock.mockReturnValue(321);

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("321");
    expect(authenticateAdminMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("applies pre-lock before origin checks", async () => {
    getLoginLockRetryAfterSecondsMock.mockReturnValue(120);

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json"
      }
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(authenticateAdminMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 429 when unauthorized attempt triggers lock", async () => {
    authenticateAdminMock.mockRejectedValue(
      new MockAuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误")
    );
    recordLoginFailureMock.mockReturnValue({
      locked           : true,
      retryAfterSeconds: 900
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "wrong" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("900");
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.COMMON_RATE_LIMITED);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 500 for unexpected auth errors", async () => {
    authenticateAdminMock.mockRejectedValue(new Error("db unavailable"));

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(500);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.COMMON_INTERNAL_ERROR);
    expect(payload.message).toBe("登录失败");
    expect(payload.error.type).toBe("InternalError");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 403 for non-unauthorized auth errors and does not count failures", async () => {
    authenticateAdminMock.mockRejectedValue(
      new MockAuthError(ERROR_CODES.AUTH_FORBIDDEN, "forbidden")
    );

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "x" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(403);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.AUTH_FORBIDDEN);
    expect(recordLoginFailureMock).not.toHaveBeenCalled();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("marks cookie as secure in production", async () => {
    Reflect.set(process.env, "NODE_ENV", "production");
    authenticateAdminMock.mockResolvedValue({
      id      : "user-1",
      username: "admin",
      email   : "admin@example.com",
      name    : "管理员",
      role    : AppRole.ADMIN
    });
    issueAuthTokenMock.mockReturnValue("signed-token");
    sanitizeRedirectPathMock.mockReturnValue("/admin");

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "secret-123" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(200);
    expect(response.headers.get("set-cookie")).toContain("Secure");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("passes undefined redirect through sanitizer when not provided", async () => {
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
      method : "POST",
      body   : JSON.stringify({ identifier: "admin@example.com", password: "secret-123" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(200);
    expect(sanitizeRedirectPathMock).toHaveBeenCalledWith(undefined);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns 400 when body is invalid JSON", async () => {
    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : "{broken-json",
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(400);
    const payload = await response.json();
    expect(payload.code).toBe(ERROR_CODES.COMMON_BAD_REQUEST);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("does not set Retry-After header for plain 401 unauthorized", async () => {
    authenticateAdminMock.mockRejectedValue(
      new MockAuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误")
    );
    recordLoginFailureMock.mockReturnValue({
      locked           : false,
      retryAfterSeconds: null
    });

    const { POST } = await import("@/app/api/auth/login/route");
    const response = await POST(new Request("http://localhost/api/auth/login", {
      method : "POST",
      body   : JSON.stringify({ identifier: "admin", password: "wrong" }),
      headers: {
        "content-type": "application/json",
        origin        : "http://localhost"
      }
    }));

    expect(response.status).toBe(401);
    expect(response.headers.get("Retry-After")).toBeNull();
  });
});
