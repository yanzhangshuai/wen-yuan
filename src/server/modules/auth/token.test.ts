/**
 * 文件定位（服务模块单测）：
 * - 覆盖领域服务的输入校验、分支处理和输出映射契约。
 * - 该层是 API Route 的核心下游，承担业务规则落地职责。
 *
 * 业务职责：
 * - 保证成功路径与异常路径都可预测。
 * - 约束状态流转和数据边界，避免误改导致上游页面行为漂移。
 */

import { SignJWT } from "jose";
import { afterEach, describe, expect, it } from "vitest";

import { AppRole } from "@/generated/prisma/enums";
import { AUTH_TOKEN_TTL_SECONDS } from "@/server/modules/auth/constants";
import { issueAuthToken, verifyAuthToken } from "@/server/modules/auth/token";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("auth token module", () => {
  const originalSecret = process.env.JWT_SECRET;
  const testSecret = "token-unit-test-secret-at-least-32-bytes";
  const adminTokenInput = {
    userId: "8f8b7b8e-17aa-4ae5-91a1-2c6e8dfd7f89",
    name  : "管理员"
  } as const;

  afterEach(() => {
    process.env.JWT_SECRET = originalSecret;
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when issuing token without JWT_SECRET", async () => {
    Reflect.deleteProperty(process.env, "JWT_SECRET");

    await expect(issueAuthToken(adminTokenInput)).rejects.toThrow("Missing auth env: JWT_SECRET");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("throws when issuing token with too-short JWT_SECRET", async () => {
    process.env.JWT_SECRET = "short-secret";

    await expect(issueAuthToken(adminTokenInput)).rejects.toThrow("JWT_SECRET must be at least 32 bytes");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when verifying without JWT_SECRET", async () => {
    Reflect.deleteProperty(process.env, "JWT_SECRET");

    await expect(verifyAuthToken("not-a-token")).resolves.toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("issues and verifies admin token payload with userId", async () => {
    process.env.JWT_SECRET = testSecret;

    const issuedAt = 1_700_000_000;
    const token = await issueAuthToken(adminTokenInput, issuedAt);
    const payload = await verifyAuthToken(token, issuedAt + 1);

    expect(payload).toEqual({
      role  : AppRole.ADMIN,
      userId: adminTokenInput.userId,
      name  : "管理员",
      iat   : issuedAt,
      exp   : issuedAt + AUTH_TOKEN_TTL_SECONDS
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("enforces 7-day ttl in issued token", async () => {
    process.env.JWT_SECRET = testSecret;

    const issuedAt = 1_700_100_000;
    const token = await issueAuthToken(adminTokenInput, issuedAt);
    const payload = await verifyAuthToken(token, issuedAt + 2);

    expect(payload).not.toBeNull();
    expect((payload as NonNullable<typeof payload>).exp - (payload as NonNullable<typeof payload>).iat).toBe(
      AUTH_TOKEN_TTL_SECONDS
    );
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null for tampered token", async () => {
    process.env.JWT_SECRET = testSecret;

    const token = await issueAuthToken(adminTokenInput, 1_700_000_000);
    const tampered = `${token.slice(0, -1)}x`;

    await expect(verifyAuthToken(tampered, 1_700_000_100)).resolves.toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null for expired token", async () => {
    process.env.JWT_SECRET = testSecret;

    const issuedAt = 1_700_000_000;
    const token = await issueAuthToken(adminTokenInput, issuedAt);

    await expect(verifyAuthToken(token, issuedAt + AUTH_TOKEN_TTL_SECONDS + 1)).resolves.toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when payload role is not admin", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.VIEWER, userId: adminTokenInput.userId, name: "只读" })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when iat is missing", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({
      role  : AppRole.ADMIN,
      userId: adminTokenInput.userId,
      name  : "管理员"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when exp is missing", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({
      role  : AppRole.ADMIN,
      userId: adminTokenInput.userId,
      name  : "管理员"
    })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("coerces non-string name to empty string", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({ role: AppRole.ADMIN, userId: adminTokenInput.userId, name: 12345 })
      .setProtectedHeader({ alg: "HS256", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toEqual({
      role  : AppRole.ADMIN,
      userId: adminTokenInput.userId,
      name  : "",
      iat   : 1_700_000_000,
      exp   : 1_700_000_100
    });
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("returns null when token algorithm is not HS256", async () => {
    process.env.JWT_SECRET = testSecret;

    const secret = new TextEncoder().encode(testSecret);
    const token = await new SignJWT({
      role  : AppRole.ADMIN,
      userId: adminTokenInput.userId,
      name  : "管理员"
    })
      .setProtectedHeader({ alg: "HS384", typ: "JWT" })
      .setIssuedAt(1_700_000_000)
      .setExpirationTime(1_700_000_100)
      .sign(secret);

    await expect(verifyAuthToken(token, 1_700_000_010)).resolves.toBeNull();
  });
});
