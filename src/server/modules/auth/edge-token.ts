import {
  AUTH_ADMIN_ROLE,
  type AuthTokenPayload
} from "./constants";

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing auth env: JWT_SECRET");
  }

  return secret;
}

function decodeBase64UrlToBytes(value: string): Uint8Array | null {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = `${base64}${"=".repeat((4 - (base64.length % 4)) % 4)}`;

  if (typeof atob !== "function") {
    return null;
  }

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);

    for (let index = 0; index < binary.length; index += 1) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    return null;
  }
}

function decodePayload(value: string): AuthTokenPayload | null {
  const bytes = decodeBase64UrlToBytes(value);
  if (!bytes) {
    return null;
  }

  try {
    const json = new TextDecoder().decode(bytes);
    return JSON.parse(json) as AuthTokenPayload;
  } catch {
    return null;
  }
}

/**
 * Edge 运行时的 JWT 校验实现，避免在 middleware 中依赖 Node.js 模块。
 */
export async function verifyAuthTokenForEdge(
  token: string,
  now = Math.floor(Date.now() / 1000)
): Promise<AuthTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signatureSegment] = parts;
  const signature = decodeBase64UrlToBytes(signatureSegment);
  if (!signature) {
    return null;
  }

  const payload = decodePayload(encodedPayload);
  if (!payload || payload.role !== AUTH_ADMIN_ROLE) {
    return null;
  }

  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= now) {
    return null;
  }

  const secret = getJwtSecret();
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );

  const unsignedToken = `${encodedHeader}.${encodedPayload}`;
  const signatureBuffer = signature.buffer as ArrayBuffer;
  const unsignedBuffer = new TextEncoder().encode(unsignedToken).buffer as ArrayBuffer;
  const verified = await crypto.subtle.verify(
    "HMAC",
    key,
    signatureBuffer,
    unsignedBuffer
  );

  return verified ? payload : null;
}
