import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ENCRYPTED_VALUE_PREFIX = "enc:v1";

/**
 * 功能：读取服务端敏感字段加密所需的主密钥。
 * 输入：无。
 * 输出：环境变量中的原始密钥材料。
 * 异常：当 APP_ENCRYPTION_KEY 缺失时抛出错误。
 * 副作用：读取 process.env。
 */
function getEncryptionKeyMaterial(): string {
  const keyMaterial = process.env.APP_ENCRYPTION_KEY;
  if (!keyMaterial) {
    throw new Error("Missing encryption key: APP_ENCRYPTION_KEY");
  }

  return keyMaterial;
}

/**
 * 功能：将环境变量中的密钥材料稳定映射为 AES-256-GCM 所需的 32 字节密钥。
 * 输入：keyMaterial，为原始字符串密钥。
 * 输出：可直接用于 `aes-256-gcm` 的二进制密钥。
 * 异常：无。
 * 副作用：无。
 */
function deriveAesKey(keyMaterial: string): Buffer {
  return createHash("sha256").update(keyMaterial, "utf8").digest();
}

/**
 * 功能：将敏感明文加密为可持久化的密文字符串。
 * 输入：plainText，为待加密明文；空字符串直接原样返回。
 * 输出：带版本前缀的 `enc:v1:<iv>:<tag>:<payload>` 密文。
 * 异常：当缺失加密密钥或底层加密失败时抛出错误。
 * 副作用：读取环境变量并生成随机 IV。
 */
export function encryptValue(plainText: string): string {
  if (!plainText) {
    return plainText;
  }

  const key = deriveAesKey(getEncryptionKeyMaterial());
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTED_VALUE_PREFIX,
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(":");
}

/**
 * 功能：解密由 encryptValue 生成的密文字符串。
 * 输入：cipherText，为 `enc:v1` 格式密文；空字符串直接原样返回。
 * 输出：解密后的明文。
 * 异常：当密文格式非法、密钥缺失或鉴权标签校验失败时抛出错误。
 * 副作用：读取环境变量。
 */
export function decryptValue(cipherText: string): string {
  if (!cipherText) {
    return cipherText;
  }

  const [prefix, ivEncoded, tagEncoded, payloadEncoded] = cipherText.split(":");
  if (prefix !== ENCRYPTED_VALUE_PREFIX || !ivEncoded || !tagEncoded || !payloadEncoded) {
    throw new Error("Invalid encrypted payload format");
  }

  const key = deriveAesKey(getEncryptionKeyMaterial());
  const iv = Buffer.from(ivEncoded, "base64url");
  const tag = Buffer.from(tagEncoded, "base64url");
  const payload = Buffer.from(payloadEncoded, "base64url");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(payload), decipher.final()]);
  return decrypted.toString("utf8");
}

/**
 * 功能：对敏感值进行脱敏展示，避免在页面或日志中回显全量内容。
 * 输入：value，为原始敏感值或 null。
 * 输出：保留前四后四位的脱敏字符串；空值返回 null。
 * 异常：无。
 * 副作用：无。
 */
export function maskSensitiveValue(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.length <= 8) {
    return "*".repeat(value.length);
  }

  return `${value.slice(0, 4)}${"*".repeat(value.length - 8)}${value.slice(-4)}`;
}
