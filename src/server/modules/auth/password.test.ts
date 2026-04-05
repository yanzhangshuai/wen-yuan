import { describe, expect, it } from "vitest";

import { hashPassword, verifyPassword } from "./password";

/**
 * 文件定位（服务层工具函数单测）：
 * - 被测对象是认证模块的密码处理工具，不依赖 Next.js 路由上下文，运行在 Node.js 测试环境。
 * - 该测试不关注 UI，而是保障“口令存储与校验”这一安全基础能力。
 *
 * 业务职责：
 * - 约束密码必须以不可逆哈希形式保存，禁止明文落库（安全边界）。
 * - 约束登录校验能够区分“正确口令”和“错误口令”，避免误放行或误拒绝。
 *
 * 上下游关系：
 * - 上游：登录/注册流程提交的明文密码。
 * - 下游：数据库中的口令摘要字段，以及登录鉴权结果。
 */
describe("password helpers", () => {
  it("hashes password with argon2id and does not return plain text", async () => {
    // 业务意图：即使输入固定明文，输出也必须是 Argon2id 哈希字符串，而不是可直接还原的内容。
    // Arrange
    const password = "admin-password-123";

    // Act
    const hash = await hashPassword(password);

    // Assert
    expect(hash).not.toBe(password);
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies correct and incorrect passwords", async () => {
    // 分支语义：
    // - 正确密码 => 必须校验通过，确保合法用户可登录。
    // - 错误密码 => 必须校验失败，确保攻击者不能通过猜测口令进入系统。
    // Arrange
    const password = "admin-password-123";
    const hash = await hashPassword(password);

    // Act / Assert
    await expect(verifyPassword(password, hash)).resolves.toBe(true);
    await expect(verifyPassword("wrong-password", hash)).resolves.toBe(false);
  });
});
