import OSS from "ali-oss";

import type {
  PutObjectInput,
  StorageProviderClient,
  StoredObject
} from "@/server/providers/storage/storage.types";
import {
  buildStorageObjectUrl,
  normalizeStorageKey,
  normalizeStoragePublicBaseUrl
} from "@/server/providers/storage/storage.utils";

interface OssObjectClient {
  put(
    key: string,
    body: Buffer,
    options?: {
      headers?: Record<string, string>;
    }
  ): Promise<unknown>;
  delete(key: string): Promise<unknown>;
  get(key: string): Promise<{ content?: Buffer | Uint8Array }>;
}

export interface OssStorageProviderOptions {
  bucket?         : string;
  region?         : string;
  endpoint?       : string;
  accessKeyId?    : string;
  accessKeySecret?: string;
  publicBaseUrl?  : string;
  client?         : OssObjectClient;
}

/**
 * 功能：将任意对象体转为 Buffer，便于上传并记录准确字节数。
 * 输入：body（string/Buffer/Uint8Array）。
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
 * 功能：规范化 endpoint，允许传入 host 或完整 URL。
 * 输入：endpoint。
 * 输出：带协议的 endpoint URL 字符串。
 * 异常：endpoint 为空时抛错。
 * 副作用：无。
 */
function normalizeOssEndpoint(endpoint?: string): string {
  const trimmedEndpoint = endpoint?.trim();
  if (!trimmedEndpoint) {
    throw new Error("OSS_ENDPOINT is required");
  }

  if (/^https?:\/\//i.test(trimmedEndpoint)) {
    return trimmedEndpoint;
  }

  return `https://${trimmedEndpoint}`;
}

/**
 * 功能：根据 region 或 endpoint 推导 region（ali-oss 需 region 字段）。
 * 输入：region、endpoint。
 * 输出：标准 region（如 `oss-cn-beijing`）。
 * 异常：无法推导时抛错。
 * 副作用：无。
 */
function resolveOssRegion(region?: string, endpoint?: string): string {
  const trimmedRegion = region?.trim();
  if (trimmedRegion) {
    return trimmedRegion;
  }

  const matchedRegion = endpoint?.match(/(oss-[a-z0-9-]+)/i)?.[1];
  if (matchedRegion) {
    return matchedRegion.toLowerCase();
  }

  throw new Error("OSS_REGION is required");
}

/**
 * 功能：读取并校验 OSS provider 所需配置。
 * 输入：options（可覆盖环境变量）。
 * 输出：完整配置对象。
 * 异常：缺失关键配置时抛错。
 * 副作用：读取环境变量。
 */
function resolveOssConfig(options: OssStorageProviderOptions): Required<Omit<OssStorageProviderOptions, "client">> {
  const bucket = options.bucket?.trim() || process.env.OSS_BUCKET?.trim();
  const endpointInput = options.endpoint?.trim() || process.env.OSS_ENDPOINT?.trim();
  const accessKeyId = options.accessKeyId?.trim() || process.env.OSS_ACCESS_KEY_ID?.trim();
  const accessKeySecret = options.accessKeySecret?.trim() || process.env.OSS_ACCESS_KEY_SECRET?.trim();

  if (!bucket) {
    throw new Error("OSS_BUCKET is required");
  }
  if (!accessKeyId) {
    throw new Error("OSS_ACCESS_KEY_ID is required");
  }
  if (!accessKeySecret) {
    throw new Error("OSS_ACCESS_KEY_SECRET is required");
  }

  const endpoint = normalizeOssEndpoint(endpointInput);
  const region = resolveOssRegion(options.region || process.env.OSS_REGION, endpointInput);
  const host = endpoint.replace(/^https?:\/\//i, "");
  const defaultPublicBaseUrl = `https://${bucket}.${host}`;
  const publicBaseUrl = normalizeStoragePublicBaseUrl(
    options.publicBaseUrl || process.env.OSS_PUBLIC_BASE_URL || defaultPublicBaseUrl
  );

  return {
    bucket,
    endpoint,
    region,
    accessKeyId,
    accessKeySecret,
    publicBaseUrl
  };
}

/**
 * 功能：阿里云 OSS 存储实现，负责对象上传、删除与外链拼接。
 * 输入：可选配置（默认读取环境变量）。
 * 输出：StorageProviderClient 实例。
 * 异常：配置缺失或 OSS SDK 调用失败时抛错。
 * 副作用：网络请求到 OSS。
 */
export class OssStorageProvider implements StorageProviderClient {
  private readonly client       : OssObjectClient;
  private readonly publicBaseUrl: string;

  constructor(options: OssStorageProviderOptions = {}) {
    const config = resolveOssConfig(options);

    this.client = options.client ?? new OSS({
      region         : config.region,
      endpoint       : config.endpoint,
      bucket         : config.bucket,
      accessKeyId    : config.accessKeyId,
      accessKeySecret: config.accessKeySecret
    });
    this.publicBaseUrl = config.publicBaseUrl;
  }

  async putObject(input: PutObjectInput): Promise<StoredObject> {
    const normalizedKey = normalizeStorageKey(input.key);
    const bodyBuffer = toBuffer(input.body);

    await this.client.put(normalizedKey, bodyBuffer, {
      headers: input.contentType
        ? { "Content-Type": input.contentType }
        : undefined
    });

    return {
      key        : normalizedKey,
      url        : this.getObjectUrl(normalizedKey),
      contentType: input.contentType ?? null,
      size       : bodyBuffer.byteLength
    };
  }

  async deleteObject(key: string): Promise<void> {
    const normalizedKey = normalizeStorageKey(key);

    try {
      await this.client.delete(normalizedKey);
    } catch (error) {
      const noSuchKeyError = typeof error === "object" &&
        error !== null &&
        "code" in error &&
        error.code === "NoSuchKey";
      const notFoundStatus = typeof error === "object" &&
        error !== null &&
        "status" in error &&
        error.status === 404;

      if (noSuchKeyError || notFoundStatus) {
        return;
      }

      throw error;
    }
  }

  getObjectUrl(key: string): string {
    const normalizedKey = normalizeStorageKey(key);
    return buildStorageObjectUrl(normalizedKey, this.publicBaseUrl);
  }

  /**
   * 功能：从 OSS 下载对象内容。
   * 输入：key，对象存储键值。
   * 输出：原始二进制 Buffer。
   * 异常：对象不存在或网络错误时抛错。
   * 副作用：网络请求到 OSS。
   */
  async getObject(key: string): Promise<Buffer> {
    const normalizedKey = normalizeStorageKey(key);
    const result = await this.client.get(normalizedKey);
    const content = result.content;
    if (!content) {
      throw new Error(`Failed to get object content for key: ${normalizedKey}`);
    }

    return Buffer.isBuffer(content) ? content : Buffer.from(content);
  }
}
