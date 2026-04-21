import { jwtVerify, SignJWT } from "jose";

import {
  AUTH_ADMIN_ROLE,
  AUTH_TOKEN_TTL_SECONDS,
  type AuthTokenPayload
} from "@/server/modules/auth/constants";

/**
 * =============================================================================
 * 文件定位（JWT 签发/校验实现层）
 * -----------------------------------------------------------------------------
 * 本文件负责 Auth 模块中“会话令牌”的核心加解密行为，属于服务端安全逻辑层。
 *
 * 业务职责：
 * 1) 签发管理员登录 JWT（包含角色、名称、过期时间）；
 * 2) 校验 JWT 的签名与时间合法性；
 * 3) 将第三方库 payload 归一为系统内部 `AuthTokenPayload`。
 *
 * 设计原因：
 * - 把 token 逻辑集中，避免 route/middleware 分散写签名算法与密钥读取；
 * - 统一返回 null 而非抛错，降低上层鉴权分支复杂度。
 *
 * 安全边界：
 * - 仅接受 HS256；
 * - 强制 JWT_SECRET 最小长度，避免弱密钥风险；
 * - 仅认可 ADMIN 角色 token，防止角色漂移导致误授权。
 * =============================================================================
 */
const JWT_ALGORITHM = "HS256";

function getJwtSecretBytes(): Uint8Array {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    // 这是部署级硬性前置条件：缺失密钥时必须失败，不能降级到不安全默认值。
    throw new Error("Missing auth env: JWT_SECRET");
  }

  const encoded = new TextEncoder().encode(secret);
  if (encoded.byteLength < 32) {
    // 安全要求：短密钥会显著降低对暴力破解的抵抗能力，必须直接阻断启动/签发。
    throw new Error("JWT_SECRET must be at least 32 bytes");
  }

  return encoded;
}

/**
 * 功能：签发管理员 JWT，payload 包含 role/userId/name/iat/exp。
 * 输入：管理员身份快照（`userId/name`）与 now，秒级时间戳，默认使用当前时间。
 * 输出：HS256 签名后的 JWT。
 * 异常：JWT_SECRET 缺失或不满足安全长度时抛错。
 * 副作用：无。
 */
export async function issueAuthToken(
  input: { userId: string; name: string },
  now = Math.floor(Date.now() / 1000)
): Promise<string> {
  // 业务规则：当前系统只签发管理员 token，因此 role 固定 ADMIN。
  return new SignJWT({
    role  : AUTH_ADMIN_ROLE,
    userId: input.userId,
    name  : input.name
  })
    // 显式写 alg/typ，避免依赖库默认值导致行为不透明。
    .setProtectedHeader({ alg: JWT_ALGORITHM, typ: "JWT" })
    // 使用秒级 now 方便测试注入固定时间，保证鉴权测试可重复。
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
    // jose 在这里完成签名校验 + 时间窗口校验（exp/nbf 等）。
    const { payload } = await jwtVerify(token, getJwtSecretBytes(), {
      algorithms : [JWT_ALGORITHM],
      currentDate: new Date(now * 1000)
    });

    // 业务边界：即使 JWT 结构合法，也只承认管理员 token。
    if (payload.role !== AUTH_ADMIN_ROLE) {
      return null;
    }

    if (typeof payload.userId !== "string" || payload.userId.length === 0) {
      return null;
    }

    // 防御校验：iat/exp 缺失时视为非法 token，避免产生“永不过期”或不完整会话。
    if (typeof payload.iat !== "number" || typeof payload.exp !== "number") {
      return null;
    }

    return {
      role  : AUTH_ADMIN_ROLE,
      userId: payload.userId,
      // name 不是授权字段，缺失时回退空串，避免影响鉴权判断。
      name  : typeof payload.name === "string" ? payload.name : "",
      iat   : payload.iat,
      exp   : payload.exp
    };
  } catch {
    // 设计原因：上游只关心“token 是否可用”，不关心底层失败细节；
    // 统一返回 null 可让 middleware/layout 走同一未登录分支。
    return null;
  }
}
