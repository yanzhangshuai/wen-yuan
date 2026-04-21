/**
 * 文件定位（Next.js middleware 单测）：
 * - 对应项目根 middleware 的访问控制与请求预处理逻辑验证。
 * - middleware 运行在路由处理前，是鉴权与链路控制的第一道边界。
 *
 * 业务职责：
 * - 根据路径与登录态决定放行、重写或重定向。
 * - 防止未授权访问受限页面，同时保障公开路径可正常访问。
 */

import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";

import { AppRole } from "@/generated/prisma/enums";
import {
  buildCurrentPath,
  buildCurrentPathFromUrl,
  buildRedirectTarget,
  middleware,
  resolveAuthRole
} from "../middleware";
import {
  AUTH_COOKIE_NAME,
  issueAuthToken
} from "@/server/modules/auth";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("middleware helpers", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testJwtSecret = "unit-test-secret-1234567890-abcdef";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("builds current path with search", () => {
    expect(buildCurrentPath("/admin/model", "?tab=keys")).toBe("/admin/model?tab=keys");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("builds current path directly from request url", () => {
    expect(buildCurrentPathFromUrl("http://localhost/admin/model?tab=keys")).toBe("/admin/model?tab=keys");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("builds login redirect target", () => {
    expect(buildRedirectTarget("/admin/model?tab=keys")).toBe("/login?redirect=%2Fadmin%2Fmodel%3Ftab%3Dkeys");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("resolves valid token to admin and invalid token to viewer", async () => {
    process.env.JWT_SECRET = testJwtSecret;
    const token = await issueAuthToken({ userId: "user-1", name: "管理员" }, Math.floor(Date.now() / 1000));

    return Promise.all([
      expect(resolveAuthRole(token)).resolves.toBe(AppRole.ADMIN),
      expect(resolveAuthRole("bad-token")).resolves.toBe(AppRole.VIEWER),
      expect(resolveAuthRole(undefined)).resolves.toBe(AppRole.VIEWER)
    ]);
  });
});

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("middleware", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testJwtSecret = "unit-test-secret-1234567890-abcdef";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("redirects viewer access from /admin/model to login", async () => {
    const request = new NextRequest("http://localhost/admin/model?tab=keys");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fadmin%2Fmodel%3Ftab%3Dkeys"
    );
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("redirects viewer access from /admin root to login with encoded redirect", async () => {
    const request = new NextRequest("http://localhost/admin");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?redirect=%2Fadmin");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("allows authenticated admin access to /admin/model and injects admin role header", async () => {
    process.env.JWT_SECRET = testJwtSecret;
    const token = await issueAuthToken({ userId: "user-1", name: "管理员" }, Math.floor(Date.now() / 1000));
    const request = new NextRequest("http://localhost/admin/model?tab=keys", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`
      }
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-auth-role")).toBe(AppRole.ADMIN);
    expect(response.headers.get("x-middleware-request-x-auth-user-id")).toBe("user-1");
    expect(response.headers.get("x-middleware-request-x-auth-current-path")).toBe("/admin/model?tab=keys");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("allows viewer access to / and injects viewer role header", async () => {
    const request = new NextRequest("http://localhost/");

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-auth-role")).toBe(AppRole.VIEWER);
    expect(response.headers.get("x-middleware-request-x-auth-user-id")).toBe("");
    expect(response.headers.get("x-middleware-request-x-auth-current-path")).toBe("/");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("redirects unauthenticated access to /api/admin/ routes to login", async () => {
    const request = new NextRequest("http://localhost/api/admin/models");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fapi%2Fadmin%2Fmodels"
    );
  });
});
