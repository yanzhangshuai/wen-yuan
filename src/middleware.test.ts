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

describe("middleware helpers", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testJwtSecret = "unit-test-secret-1234567890-abcdef";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("builds current path with search", () => {
    expect(buildCurrentPath("/admin/model", "?tab=keys")).toBe("/admin/model?tab=keys");
  });

  it("builds current path directly from request url", () => {
    expect(buildCurrentPathFromUrl("http://localhost/admin/model?tab=keys")).toBe("/admin/model?tab=keys");
  });

  it("builds login redirect target", () => {
    expect(buildRedirectTarget("/admin/model?tab=keys")).toBe("/login?redirect=%2Fadmin%2Fmodel%3Ftab%3Dkeys");
  });

  it("resolves valid token to admin and invalid token to viewer", async () => {
    process.env.JWT_SECRET = testJwtSecret;
    const token = await issueAuthToken(Math.floor(Date.now() / 1000));

    return Promise.all([
      expect(resolveAuthRole(token)).resolves.toBe(AppRole.ADMIN),
      expect(resolveAuthRole("bad-token")).resolves.toBe(AppRole.VIEWER),
      expect(resolveAuthRole(undefined)).resolves.toBe(AppRole.VIEWER)
    ]);
  });
});

describe("middleware", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testJwtSecret = "unit-test-secret-1234567890-abcdef";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("redirects viewer access from /admin/model to login", async () => {
    const request = new NextRequest("http://localhost/admin/model?tab=keys");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost/login?redirect=%2Fadmin%2Fmodel%3Ftab%3Dkeys"
    );
  });

  it("redirects viewer access from /admin root to login with encoded redirect", async () => {
    const request = new NextRequest("http://localhost/admin");

    const response = await middleware(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login?redirect=%2Fadmin");
  });

  it("allows authenticated admin access to /admin/model and injects admin role header", async () => {
    process.env.JWT_SECRET = testJwtSecret;
    const token = await issueAuthToken(Math.floor(Date.now() / 1000));
    const request = new NextRequest("http://localhost/admin/model?tab=keys", {
      headers: {
        cookie: `${AUTH_COOKIE_NAME}=${token}`
      }
    });

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-auth-role")).toBe(AppRole.ADMIN);
    expect(response.headers.get("x-middleware-request-x-auth-user-id")).toBe("");
    expect(response.headers.get("x-middleware-request-x-auth-current-path")).toBe("/admin/model?tab=keys");
  });

  it("allows viewer access to / and injects viewer role header", async () => {
    const request = new NextRequest("http://localhost/");

    const response = await middleware(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-request-x-auth-role")).toBe(AppRole.VIEWER);
    expect(response.headers.get("x-middleware-request-x-auth-user-id")).toBe("");
    expect(response.headers.get("x-middleware-request-x-auth-current-path")).toBe("/");
  });
});
