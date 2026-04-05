import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import type {
  PutObjectInput,
  StorageProviderClient,
  StoredObject
} from "@/server/providers/storage/storage.types";
import {
  DEFAULT_STORAGE_PUBLIC_BASE_URL,
  DEFAULT_STORAGE_ROOT,
  buildStorageObjectUrl,
  normalizeStorageKey,
  normalizeStoragePublicBaseUrl,
  resolveLocalStorageFilePath,
  resolveLocalStorageRoot
} from "@/server/providers/storage/storage.utils";

/**
 * 文件定位（服务端存储 Provider 实现层）：
 * - 这是对象存储抽象 `StorageProviderClient` 的“本地文件系统实现”。
 * - 常用于本地开发、测试环境，生产环境可切换到云存储实现而不改上层业务代码。
 */

/**
 * 功能：将任意对象内容统一转换为 Buffer，便于写入文件系统并统计大小。
 * 输入：body，为字符串、Buffer 或 Uint8Array。
 * 输出：Buffer。
 * 异常：无。
 * 副作用：无。
 */
function toBuffer(body: PutObjectInput["body"]): Buffer {
  if (typeof body === "string") {
    return Buffer.from(body, "utf8");
  }

  if (Buffer.isBuffer(body)) {
    return body;
  }

  return Buffer.from(body);
}

/**
 * 功能：提供本地文件系统存储实现。
 * 输入：rootDirectory，为对象根目录；publicBaseUrl，为公开访问前缀。
 * 输出：StorageProviderClient 实例。
 * 异常：后续方法在 key 非法或写盘失败时抛错。
 * 副作用：读取环境变量。
 */
export class LocalStorageProvider implements StorageProviderClient {
  private readonly rootDirectory: string;
  private readonly publicBaseUrl: string;

  constructor(
    rootDirectory = process.env.STORAGE_LOCAL_ROOT || DEFAULT_STORAGE_ROOT,
    publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL || DEFAULT_STORAGE_PUBLIC_BASE_URL
  ) {
    // 构造期完成路径与 URL 归一化，确保后续读写行为一致、可预测。
    this.rootDirectory = resolveLocalStorageRoot(rootDirectory);
    this.publicBaseUrl = normalizeStoragePublicBaseUrl(publicBaseUrl);
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    // 统一 key 规范，阻断路径穿越等非法输入（安全防线在 normalizeStorageKey 内）。
    const normalizedKey = normalizeStorageKey(input.key);
    const targetPath = this.resolveFilePath(normalizedKey);
    const bodyBuffer = toBuffer(input.body);

    // 先确保目录存在，再写入文件，保证分层 key（如 a/b/c.txt）可落盘。
    await mkdir(path.dirname(targetPath), { recursive: true });
    await writeFile(targetPath, bodyBuffer);

    return {
      key        : normalizedKey,
      url        : this.buildObjectUrl(normalizedKey),
      contentType: input.contentType ?? null,
      size       : bodyBuffer.byteLength
    };
  }

  async deleteObject(key: string): Promise<void> {
    const normalizedKey = normalizeStorageKey(key);
    const targetPath = this.resolveFilePath(normalizedKey);

    // force=true 的业务含义：删除操作要求幂等，重复删除不应视为错误。
    await rm(targetPath, { force: true });
  }

  getObjectUrl(key: string): string {
    const normalizedKey = normalizeStorageKey(key);
    return this.buildObjectUrl(normalizedKey);
  }

  /**
   * 功能：从本地文件系统读取对象内容。
   * 输入：key，对象存储键值。
   * 输出：原始二进制 Buffer。
   * 异常：文件不存在时抛 ENOENT 错误。
   * 副作用：磁盘 I/O。
   */
  async getObject(key: string): Promise<Buffer> {
    const normalizedKey = normalizeStorageKey(key);
    const targetPath = this.resolveFilePath(normalizedKey);
    return readFile(targetPath);
  }

  private resolveFilePath(key: string): string {
    return resolveLocalStorageFilePath(key, this.rootDirectory);
  }

  private buildObjectUrl(key: string): string {
    return buildStorageObjectUrl(key, this.publicBaseUrl);
  }
}
