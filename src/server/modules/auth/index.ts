import { createHmac, timingSafeEqual } from "node:crypto";

import type { PrismaClient } from "@/generated/prisma/client";
import { prisma } from "@/server/db/prisma";
import { ERROR_CODES, type ErrorCode } from "@/types/api";

import { verifyPassword } from "./password";

export const AUTH_COOKIE_NAME = "token";
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;

const JWT_HEADER = {
  alg: "HS256",
  typ: "JWT"
} as const;

export interface AuthContext {
  userId: string | null;
  role  : "admin" | "viewer";
}

export interface AuthTokenPayload {
  role: "admin";
  iat : number;
  exp : number;
}

export interface LoginInput {
  identifier: string;
  password  : string;
}

export interface AuthenticatedAdminUser {
  id      : string;
  username: string;
  email   : string;
  name    : string;
  role    : "admin";
}

export class AuthError extends Error {
  readonly code: ErrorCode;

  constructor(code: ErrorCode, message: string) {
    super(message);
    this.code = code;
    this.name = "AuthError";
  }
}

/**
 * 所有登录跳转都必须限定在站内路径，避免 redirect 被用作开放跳转。
 */
export function sanitizeRedirectPath(redirect: string | null | undefined): string {
  if (!redirect) {
    return "/";
  }

  if (!redirect.startsWith("/") || redirect.startsWith("//")) {
    return "/";
  }

  return redirect;
}

export function getAuthContext(headers: Headers): AuthContext {
  const roleHeader = headers.get("x-auth-role");
  const userIdHeader = headers.get("x-auth-user-id");

  return {
    userId: userIdHeader,
    role  : roleHeader === "admin" ? "admin" : "viewer"
  };
}

export function requireAdmin(auth: AuthContext): void {
  if (auth.role !== "admin") {
    throw new AuthError(ERROR_CODES.AUTH_FORBIDDEN, "当前用户没有管理员权限");
  }
}

/**
 * 登录校验统一走 users 表，避免 env-only 与数据库认证两套口径并存。
 */
export async function authenticateAdmin(
  input: LoginInput,
  prismaClient: PrismaClient = prisma
): Promise<AuthenticatedAdminUser> {
  const user = await prismaClient.user.findFirst({
    where: {
      OR: [{ email: input.identifier }, { username: input.identifier }]
    }
  });

  if (!user || !user.isActive || user.role !== "ADMIN") {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误");
  }

  const passwordMatched = await verifyPassword(input.password, user.password);
  if (!passwordMatched) {
    throw new AuthError(ERROR_CODES.AUTH_UNAUTHORIZED, "账号或密码错误");
  }

  await prismaClient.user.update({
    where: { id: user.id },
    data : { lastLoginAt: new Date() }
  });

  return {
    id      : user.id,
    username: user.username,
    email   : user.email,
    name    : user.name,
    role    : "admin"
  };
}

export function issueAuthToken(now = Math.floor(Date.now() / 1000)): string {
  const payload: AuthTokenPayload = {
    role: "admin",
    iat : now,
    exp : now + AUTH_TOKEN_TTL_SECONDS
  };

  return signToken(payload);
}

export function verifyAuthToken(token: string, now = Math.floor(Date.now() / 1000)): AuthTokenPayload | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = signSegment(`${encodedHeader}.${encodedPayload}`);
  if (!safeEqual(signature, expectedSignature)) {
    return null;
  }

  const payload = decodeSegment<AuthTokenPayload>(encodedPayload);
  if (!payload || payload.role !== "admin") {
    return null;
  }

  if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp) || payload.exp <= now) {
    return null;
  }

  return payload;
}

function signToken(payload: AuthTokenPayload): string {
  const encodedHeader = encodeSegment(JWT_HEADER);
  const encodedPayload = encodeSegment(payload);
  const unsigned = `${encodedHeader}.${encodedPayload}`;
  const signature = signSegment(unsigned);

  return `${unsigned}.${signature}`;
}

function signSegment(value: string): string {
  return createHmac("sha256", getJwtSecret()).update(value).digest("base64url");
}

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error("Missing auth env: JWT_SECRET");
  }

  return secret;
}

function encodeSegment(value: object): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function decodeSegment<T>(value: string): T | null {
  try {
    return JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);

  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }

  return timingSafeEqual(leftBuffer, rightBuffer);
}

export { hashPassword, verifyPassword } from "./password";
