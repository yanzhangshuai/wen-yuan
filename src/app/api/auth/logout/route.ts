import { okJson } from "@/server/http/route-utils";
import { AUTH_COOKIE_NAME } from "@/server/modules/auth";

/**
 * =============================================================================
 * 文件定位（Next.js Route Handler：登出接口）
 * -----------------------------------------------------------------------------
 * 文件路径：`app/api/auth/logout/route.ts`
 *
 * 框架语义：
 * - `route.ts` 是 App Router 的服务端接口文件；
 * - 导出的 `POST` 函数会被 Next.js 映射为 `POST /api/auth/logout`；
 * - 该逻辑运行在服务端，可直接通过响应头安全地修改 httpOnly Cookie。
 *
 * 业务职责：
 * 1) 结束当前管理员会话；
 * 2) 删除鉴权 Cookie；
 * 3) 返回统一成功响应，便于前端无分支地收敛 UI 状态。
 *
 * 设计说明：
 * - 本接口采用“幂等成功”策略：即使用户本来就未登录，也返回成功。
 *   这是产品体验规则，不是技术限制，目的是让前端退出流程稳定可重复。
 * =============================================================================
 */
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
  // 统一成功响应：前端只要拿到成功即可执行页面跳转，不依赖复杂 data 内容。
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
    // 将 cookie 值置空并配合 maxAge=0，可触发浏览器立即删除该 cookie。
    value   : "",
    httpOnly: true,
    // 与登录接口保持一致的 SameSite 策略，避免不同策略引发行为漂移。
    sameSite: "strict",
    path    : "/",
    // 关键删除指令：过期时间立即生效。
    maxAge  : 0
  });

  // 返回 200 成功，确保调用方在“已登录/未登录”两种状态下都能统一处理。
  return response;
}
