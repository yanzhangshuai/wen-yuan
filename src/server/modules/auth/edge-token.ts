import { verifyAuthToken } from "./token";

/**
 * =============================================================================
 * 文件定位（Edge 兼容适配层）
 * -----------------------------------------------------------------------------
 * 本文件是 Auth token 校验在 Edge Runtime 的轻量包装层。
 *
 * 为什么单独存在：
 * - `middleware.ts` 运行于 Edge 语义，调用入口需要明确表达“Edge 场景可用”；
 * - 通过单独导出函数，调用方不需要关心底层实现细节，后续替换实现时改动面更小。
 *
 * 当前实现说明：
 * - 直接复用 `token.ts` 的校验逻辑；
 * - 保持签名一致（token + now），方便测试与中间件复用。
 * =============================================================================
 *
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
