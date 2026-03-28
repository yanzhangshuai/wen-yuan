import { describe, expect, it } from "vitest";

import { decryptValue, encryptValue, maskSensitiveValue } from "./encryption";

describe("security/encryption", () => {
  it("encryptValue 输出 enc:v1: 前缀", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const cipher = encryptValue("sk-test-api-key");
    expect(cipher.startsWith("enc:v1:")).toBe(true);
  });

  it("decryptValue 可往返还原明文", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const plain = "sk-test-api-key-12345";
    const cipher = encryptValue(plain);
    const result = decryptValue(cipher);
    expect(result).toBe(plain);
  });

  it("空字符串透传", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    expect(encryptValue("")).toBe("");
    expect(decryptValue("")).toBe("");
  });

  it("同明文多次加密得到不同密文（随机 IV）", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const plain = "sk-same-key";
    const cipher1 = encryptValue(plain);
    const cipher2 = encryptValue(plain);

    expect(cipher1).not.toBe(cipher2);
    expect(decryptValue(cipher1)).toBe(plain);
    expect(decryptValue(cipher2)).toBe(plain);
  });

  it("篡改密文后解密抛错（GCM 认证失败）", () => {
    process.env.APP_ENCRYPTION_KEY = "test-enc-key-exactly-32-bytes-ok!";
    const cipher = encryptValue("original-key");
    const tampered = `${cipher.slice(0, -4)}XXXX`;

    expect(() => decryptValue(tampered)).toThrow();
  });

  it("maskSensitiveValue 输出脱敏格式", () => {
    expect(maskSensitiveValue("sk-abcdefgh1234")).toBe("sk-a*******1234");
    expect(maskSensitiveValue("sk-short")).toBe("********");
    expect(maskSensitiveValue("")).toBeNull();
    expect(maskSensitiveValue(null)).toBeNull();
  });

  it("缺失 APP_ENCRYPTION_KEY 时抛明确错误", () => {
    const savedKey = process.env.APP_ENCRYPTION_KEY;
    delete process.env.APP_ENCRYPTION_KEY;

    expect(() => encryptValue("some-key")).toThrow(/APP_ENCRYPTION_KEY/);

    process.env.APP_ENCRYPTION_KEY = savedKey;
  });
});
