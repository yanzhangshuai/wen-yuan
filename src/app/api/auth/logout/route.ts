import { okJson } from "@/server/http/route-utils";
import { AUTH_COOKIE_NAME } from "@/server/modules/auth";

const LOGOUT_PATH = "/api/auth/logout";
const LOGOUT_SUCCESS_CODE = "AUTH_LOGGED_OUT";

/**
 * 功能：注销当前管理员会话。
 * 输入：无请求体，无需已登录上下文（幂等接口）。
 * 输出：统一成功响应，`data` 固定为 `null`。
 * 异常：无（接口始终返回成功，便于前端收敛状态）。
 * 副作用：清空 `AUTH_COOKIE_NAME` 对应的 httpOnly 鉴权 Cookie。
 */
export function POST() {
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
    sameSite: "strict",
    path    : "/",
    maxAge  : 0
  });

  return response;
}
