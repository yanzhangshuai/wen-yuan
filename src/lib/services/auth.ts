/**
 * =============================================================================
 * 文件定位（Next.js 客户端服务层）
 * -----------------------------------------------------------------------------
 * 本文件位于 `src/lib/services`，是“前端调用后端鉴权接口”的轻量服务封装层。
 *
 * 在 Next.js 应用中的角色：
 * 1) 该文件不直接参与路由约定（不是 page/layout/route），而是被 Client Component
 *    或前端交互逻辑调用；
 * 2) 通过 `clientFetch/clientMutate` 访问 `app/api/auth/*` Route Handler；
 * 3) 负责把“页面表单输入”转换为“接口请求”，并把“接口响应”转换为页面可消费的数据。
 *
 * 核心业务职责：
 * - `login`：向 `/api/auth/login` 提交账号密码，获取登录成功后的跳转目标；
 * - `logout`：调用 `/api/auth/logout` 清除服务端 httpOnly 会话 Cookie。
 *
 * 上游输入：
 * - 登录表单中的 `identifier/password/redirect`（用户输入 + 当前路由上下文）。
 *
 * 下游输出：
 * - 登录成功时返回跳转路径（由后端决定，前端据此导航）；
 * - 登录失败时抛出异常，交给调用方展示错误态；
 * - 登出请求成功后无返回数据，由调用方决定跳转或刷新策略。
 *
 * 维护注意：
 * - 这里的请求路径与请求体字段是前后端契约，不能随意改名；
 * - `redirect` 是业务链路字段，不是技术冗余：用于登录后回到用户原目标页面。
 * =============================================================================
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 登录请求体（前端 -> `/api/auth/login`）
 */
export interface LoginBody {
  /**
   * 登录标识：可输入用户名或邮箱。
   * 字段来源：用户在登录表单输入。
   * 业务意义：后端统一按“用户名或邮箱”检索用户，减少用户记忆成本。
   */
  identifier: string;
  /**
   * 明文密码。
   * 字段来源：用户输入。
   * 业务意义：仅用于本次认证请求，后端会做哈希校验，不会明文持久化。
   */
  password  : string;
  /**
   * 登录成功后希望跳转的站内路径。
   * 字段来源：通常来自登录页 query（如 `?redirect=/admin/books`）。
   * 业务意义：保证登录完成后回到用户原先要访问的页面，提升管理端使用连续性。
   * 注意：该字段最终会由后端做安全清洗，防止开放重定向。
   */
  redirect  : string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 功能：退出登录（清除服务端会话 Cookie）。
 *
 * 业务流程位置：
 * - 一般由“退出登录”按钮点击后触发；
 * - 调用成功后，调用方通常会跳转到登录页或公开页面。
 *
 * Next.js 语义：
 * - 这里调用的是 Route Handler：`POST /api/auth/logout`；
 * - Cookie 清理由服务端响应完成（httpOnly Cookie 前端 JS 不能直接删）。
 *
 * 输入：无。
 * 输出：`Promise<void>`（调用方不依赖响应体内容）。
 * 异常：请求失败时抛出，由调用方决定提示文案。
 * 副作用：服务端会把鉴权 Cookie 置空并过期。
 */
export async function logout(): Promise<void> {
  await clientMutate("/api/auth/logout", { method: "POST" });
}

/**
 * 功能：提交管理员登录凭据并获取登录后跳转路径。
 *
 * 业务流程位置：
 * - 登录页提交表单时调用；
 * - 成功后由页面层执行 `router.replace(redirect || 默认页)`；
 * - 失败时由页面层展示错误文案并保持当前输入状态。
 *
 * Next.js / React 语义：
 * - 该函数本身不持有 React 状态，只负责 I/O；
 * - 是否展示 loading、error、重试按钮由调用组件的状态管理决定（如 `useState`/`useTransition`）。
 *
 * @param body 登录参数对象，来源于登录表单。
 * @returns 后端返回的跳转路径；若后端未返回则为 `undefined`（调用方走默认跳转）。
 * @throws 网络错误、后端业务错误都会抛出异常，由调用方统一兜底处理。
 */
export async function login(body: LoginBody): Promise<string | undefined> {
  // 设计原因：显式声明 JSON 请求头，确保后端按 JSON 解析而非表单解析。
  const result = await clientFetch<{ redirect?: string }>("/api/auth/login", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
  // 业务约定：后端会清洗 redirect，前端直接消费其结果即可，不做二次拼接推断。
  return result.redirect;
}
