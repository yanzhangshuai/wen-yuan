import argon2 from "argon2";

// 与 PRD 保持一致，统一使用 Argon2id 基线参数，避免不同入口出现多套哈希策略。
const PASSWORD_HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1
} as const;

/**
 * 功能：对登录密码执行 Argon2id 哈希。
 * 输入：password，要求为待写入数据库的明文密码。
 * 输出：Argon2id 哈希字符串，可直接落库存储。
 * 异常：当底层 argon2 计算失败时抛出错误。
 * 副作用：无。
 */
export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, PASSWORD_HASH_OPTIONS);
}

/**
 * 功能：校验明文密码与数据库中的 Argon2id 哈希是否匹配。
 * 输入：password 为用户输入的明文密码；passwordHash 为数据库中的密码哈希。
 * 输出：匹配返回 true，不匹配返回 false。
 * 异常：当 passwordHash 非法或底层 argon2 校验失败时抛出错误。
 * 副作用：无。
 */
export async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
  return argon2.verify(passwordHash, password);
}
