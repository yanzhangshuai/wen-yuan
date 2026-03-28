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
    this.rootDirectory = resolveLocalStorageRoot(rootDirectory);
    this.publicBaseUrl = normalizeStoragePublicBaseUrl(publicBaseUrl);
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const normalizedKey = normalizeStorageKey(input.key);
    const targetPath = this.resolveFilePath(normalizedKey);
    const bodyBuffer = toBuffer(input.body);

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
