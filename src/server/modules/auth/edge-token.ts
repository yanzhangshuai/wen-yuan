import { verifyAuthToken } from "./token";

/**
 * 功能：在 Edge Runtime 中校验认证 token。
 * 输入：`token: string`（JWT 字符串）、`now?: number`（秒级 Unix 时间戳）。
 * 输出：`Promise<AuthTokenPayload | null>`；校验失败或过期返回 `null`。
 * 异常：无（底层校验失败统一转换为 `null`）。
 * 副作用：无。
 */
export async function verifyAuthTokenForEdge(
  token: string,
  now = Math.floor(Date.now() / 1000)
) {
  return verifyAuthToken(token, now);
}
