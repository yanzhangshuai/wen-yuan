import { AppRole, type AppRole as PrismaAppRole } from "@/generated/prisma/enums";

export const AUTH_COOKIE_NAME = "token";
export const AUTH_TOKEN_TTL_SECONDS = 60 * 60 * 24 * 7;
export const AUTH_ADMIN_ROLE = AppRole.ADMIN;
export const AUTH_VIEWER_ROLE = AppRole.VIEWER;

export type AuthRole = PrismaAppRole;

export interface AuthTokenPayload {
  role: AuthRole;
  iat : number;
  exp : number;
}
