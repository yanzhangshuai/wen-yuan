import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

/**
 * 被测对象：password helpers。
 * 测试目标：验证 Argon2id 密码哈希结果可用于后续登录校验。
 * 覆盖范围：success / failure。
 */
describe("password helpers", () => {
  it("hashes password with argon2id and does not return plain text", async () => {
    // Arrange
    const password = "admin-password-123";

    // Act
    const hash = await hashPassword(password);

    // Assert
    expect(hash).not.toBe(password);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies correct and incorrect passwords", async () => {
    // Arrange
    const password = "admin-password-123";
    const hash = await hashPassword(password);

    // Act / Assert
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
