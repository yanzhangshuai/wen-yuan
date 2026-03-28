import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import { AUTH_TOKEN_TTL_SECONDS } from "@/server/modules/auth/constants";
import { issueAuthToken, verifyAuthToken } from "@/server/modules/auth/token";

describe("auth token module", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "token-unit-test-secret-at-least-32-bytes";

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  it("throws when issuing token without JWT_SECRET", async () => {
    Reflect.deleteProperty(process.env, "JWT_SECRET");

    await expect(issueAuthToken("管理员")).rejects.toThrow("Missing auth env: JWT_SECRET");
  });

  it("throws when issuing token with too-short JWT_SECRET", async () => {
    process.env.JWT_SECRET = "short-secret";

    await expect(issueAuthToken("管理员")).rejects.toThrow("JWT_SECRET must be at least 32 bytes");
  });

  it("returns null when verifying without JWT_SECRET", async () => {
    Reflect.deleteProperty(process.env, "JWT_SECRET");

    await expect(verifyAuthToken("not-a-token")).resolves.toBeNull();
  });

  it("issues and verifies admin token payload", async () => {
    process.env.JWT_SECRET = testSecret;

    const issuedAt = 1_700_000_000;
    const token = await issueAuthToken("管理员", issuedAt);
    const payload = await verifyAuthToken(token, issuedAt + 1);

    expect(payload).toEqual({
      role: AppRole.ADMIN,
      name: "管理员",
      iat : issuedAt,
      exp : issuedAt + AUTH_TOKEN_TTL_SECONDS
    });
  });

  it("enforces 7-day ttl in issued token", async () => {
    process.env.JWT_SECRET = testSecret;

    const issuedAt = 1_700_100_000;
    const token = await issueAuthToken("管理员", issuedAt);
    const payload = await verifyAuthToken(token, issuedAt + 2);

    expect(payload).not.toBeNull();
    expect((payload as NonNullable<typeof payload>).exp - (payload as NonNullable<typeof payload>).iat).toBe(
      AUTH_TOKEN_TTL_SECONDS
    );
  });

  it("returns null for tampered token", async () => {
    process.env.JWT_SECRET = testSecret;

    const token = await issueAuthToken("管理员", 1_700_000_000);
    const tampered = `${token.slice(0, -1)}x`;

    await expect(verifyAuthToken(tampered, 1_700_000_100)).resolves.toBeNull();
  });

  it("returns null for expired token", async () => {
    process.env.JWT_SECRET = testSecret;

    const issuedAt = 1_700_000_000;
    const token = await issueAuthToken("管理员", issuedAt);

    await expect(verifyAuthToken(token, issuedAt + AUTH_TOKEN_TTL_SECONDS + 1)).resolves.toBeNull();
  });

  it("returns null when payload role is not admin", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.VIEWER, name: "只读" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });

  it("returns null when iat is missing", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.ADMIN, name: "管理员" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });

  it("returns null when exp is missing", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.ADMIN, name: "管理员" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });

  it("coerces non-string name to empty string", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.ADMIN, name: 12345 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toEqual({
      role: AppRole.ADMIN,
      name: "",
      iat : 1_700_000_000,
      exp : 1_700_000_100
    });
  });

  it("returns null when token algorithm is not HS256", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.ADMIN, name: "管理员" })
      .setProtectedHeader({ alg: "HS384", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });
});
