import { jwtVerify, SignJWT } from "jose";

import {
  AUTH_ADMIN_ROLE,
  AUTH_TOKEN_TTL_SECONDS,
  type AuthTokenPayload
} from "@/server/modules/auth/constants";

const JWT_ALGORITHM = "HS256";

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing auth env: JWT_SECRET");
  }

  const encoded = new TextEncoder().encode(secret);
  if (encoded.byteLength < 32) {
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }

  return encoded;
}

/**
 * 功能：签发管理员 JWT，payload 包含 role/name/iat/exp。
 * 输入：name(展示名称)、now，秒级时间戳，默认使用当前时间。
 * 输出：HS256 签名后的 JWT。
 * 异常：JWT_SECRET 缺失或不满足安全长度时抛错。
 * 副作用：无。
 */
export async function issueAuthToken(name: string, now = Math.floor(Date.now() / 1000)): Promise<string> {
  return new SignJWT({
    role: AUTH_ADMIN_ROLE,
    name
  })
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: "JWT" })
    .setIssuedAt(now)
    .setExpirationTime(now + AUTH_TOKEN_TTL_SECONDS)
    .sign(getJwtSecretBytes());
}

/**
 * 功能：验证 JWT 并返回标准化 payload。
 * 输入：token，JWT 字符串；now，秒级时间戳（用于测试时固定时间）。
 * 输出：合法返回 AuthTokenPayload，不合法返回 null。
 * 异常：内部验证异常被吞并并统一返回 null。
 * 副作用：无。
 */
export async function verifyAuthToken(
  token: string,
  now = Math.floor(Date.now() / 1000)
): Promise<AuthTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      algorithms : [JWT_ALGORITHM],
      currentDate: new Date(now * 1000)
    });

    if (payload.role !== AUTH_ADMIN_ROLE) {
      return null;
    }

    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return null;
    }

    return {
      role: AUTH_ADMIN_ROLE,
      name: typeof payload.name === "string" ? payload.name : "",
      iat : payload.iat,
      exp : payload.exp
    };
  } catch {
    return null;
  }
}
