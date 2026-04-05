import { describe, expect, it } from "vitest";

import { AUTH_COOKIE_NAME } from "@/server/modules/auth";

import { POST } from "./route";

/**
 * 文件定位（Next.js Route Handler 单测）：
 * - 对应 `app/api/auth/logout/route.ts`，该文件名在 Next.js `app/` 路由约定下会注册为 `POST /api/auth/logout`。
 * - 本测试属于接口层回归用例，不直接参与运行时路由分发，只在测试阶段执行，用来约束接口契约。
 *
 * 核心业务职责：
 * - 校验“退出登录”接口是否返回统一成功包。
 * - 校验服务端是否通过 `Set-Cookie` 清理鉴权 Cookie，防止客户端仍保留旧登录态。
 *
 * 上下游关系：
 * - 上游输入：无业务请求体，直接调用 Route Handler。
 * - 下游输出：前端登录态管理、路由守卫、后续鉴权中间件都依赖该 cookie 被正确失效。
 */
describe("POST /api/auth/logout", () => {
  it("returns success payload and clears auth cookie", async () => {
    // 业务语义：调用退出接口后，必须同时满足“响应成功 + cookie 失效”两个条件，二者缺一不可。
    // 这是业务规则，不是技术限制：如果只返回 200 但不清 cookie，会导致用户误以为已退出，实际仍可带旧会话访问受限资源。
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
