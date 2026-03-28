/**
 * @module auth
 * @description 认证（Auth）客户端服务层
 *
 * 封装登录相关的 HTTP 请求，对应后端路由 `/api/auth/*`。
 *
 * 包含内容：
 * - LoginBody：登录请求体类型
 * - login：提交登录凭据，成功返回跳转地址，失败抛出 Error
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 登录请求体
 */
export interface LoginBody {
  identifier: string;
  password  : string;
  redirect  : string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 退出登录，清除服务端 Session Cookie。
 * 对应接口：POST /api/auth/logout
 *
 * 失败时静默处理（fire-and-forget），调用方负责页面跳转。
 */
export async function logout(): Promise<void> {
  await clientMutate("/api/auth/logout", { method: "POST" });
}

/**
 * 提交登录凭据。
 * 对应接口：POST /api/auth/login
 *
 * 成功时返回后端指定的跳转路径（可能为 undefined，表示走默认路径）。
 * 失败时（凭据错误、服务异常）抛出 Error，message 为可展示文案。
 *
 * @param body 登录凭据
 * @returns 跳转路径字符串或 undefined
 */
export async function login(body: LoginBody): Promise<string | undefined> {
  const result = await clientFetch<{ redirect?: string }>("/api/auth/login", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
  return result.redirect;
}
