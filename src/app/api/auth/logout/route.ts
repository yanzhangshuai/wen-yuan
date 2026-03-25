import { okJson } from "@/server/http/route-utils";
import { AUTH_COOKIE_NAME } from "@/server/modules/auth";

const LOGOUT_PATH = "/api/auth/logout";
const LOGOUT_SUCCESS_CODE = "AUTH_LOGGED_OUT";

/**
 * 登出只需要清理认证 Cookie，不依赖请求体或当前登录态。
 * 统一返回成功响应，保证前端可以幂等调用该接口完成本地状态收口。
 */
export async function POST() {
  const response = okJson({
    path     : LOGOUT_PATH,
    requestId: crypto.randomUUID(),
    startedAt: Date.now(),
    code     : LOGOUT_SUCCESS_CODE,
    message  : "退出登录成功",
    data     : null
  });

  response.cookies.set({
    name    : AUTH_COOKIE_NAME,
    value   : "",
    httpOnly: true,
    sameSite: "lax",
    path    : "/",
    maxAge  : 0
  });

  return response;
}
