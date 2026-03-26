import { describe, expect, it } from "vitest";

import { AUTH_COOKIE_NAME } from "@/server/modules/auth";

import { POST } from "./route";

describe("POST /api/auth/logout", () => {
  it("returns success payload and clears auth cookie", async () => {
    // Act
    const response = POST();
    const payload = await response.json();
    const setCookie = response.headers.get("set-cookie");

    // Assert
    expect(response.status).toBe(200);
    expect(payload.success).toBe(true);
    expect(payload.code).toBe("AUTH_LOGGED_OUT");
    expect(payload.message).toBe("退出登录成功");
    expect(payload.data).toBeNull();
    expect(setCookie).toContain(`${AUTH_COOKIE_NAME}=`);
    expect(setCookie).toContain("Max-Age=0");
    expect(setCookie).toContain("Path=/");
    expect(setCookie).toContain("HttpOnly");
    expect(setCookie).toMatch(/samesite=strict/i);
  });
});
