/**
 * 文件定位（安全基础模块单测）：
 * - 覆盖加密/解密与密钥相关能力，属于服务端安全底座。
 * - 该层错误会影响敏感信息保护与鉴权链路可信度。
 *
 * 业务职责：
 * - 验证密钥约束、加密输出可逆性、异常输入防御行为。
 * - 确保安全策略在重构后仍保持稳定边界。
 */

import { describe, expect, it } from "vitest";

import { decryptValue, encryptValue, maskSensitiveValue } from "./encryption";

// 测试分组：围绕同一路由或同一模块的业务契约进行分支覆盖。
describe("security/encryption", () => {
  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("encryptValue 输出 enc:v1: 前缀", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const cipher = encryptValue("sk-test-api-key");
    expect(cipher.startsWith("enc:v1:")).toBe(true);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("decryptValue 可往返还原明文", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const plain = "sk-test-api-key-12345";
    const cipher = encryptValue(plain);
    const result = decryptValue(cipher);
    expect(result).toBe(plain);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("空字符串透传", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    expect(encryptValue("")).toBe("");
    expect(decryptValue("")).toBe("");
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("同明文多次加密得到不同密文（随机 IV）", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const plain = "sk-same-key";
    const cipher1 = encryptValue(plain);
    const cipher2 = encryptValue(plain);

    expect(cipher1).not.toBe(cipher2);
    expect(decryptValue(cipher1)).toBe(plain);
    expect(decryptValue(cipher2)).toBe(plain);
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("篡改密文后解密抛错（GCM 认证失败）", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const cipher = encryptValue("original-key");
    const tampered = `${cipher.slice(0, -4)}XXXX`;

    expect(() => decryptValue(tampered)).toThrow();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("maskSensitiveValue 输出脱敏格式", () => {
    expect(maskSensitiveValue("sk-abcdefgh1234")).toBe("sk-a*******1234");
    expect(maskSensitiveValue("sk-short")).toBe("********");
    expect(maskSensitiveValue("")).toBeNull();
    expect(maskSensitiveValue(null)).toBeNull();
  });

  // 用例语义：覆盖一个明确的业务分支，验证输入校验、状态码与上下游调用契约。
  it("缺失 APP_ENCRYPTION_KEY 时抛明确错误", () => {
    const savedKey = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;

    expect(() => encryptValue("some-key")).toThrow(/APP_ENCRYPTION_KEY/);

    process.env.APP_ENCRYPTION_KEY = savedKey;
  });
});
