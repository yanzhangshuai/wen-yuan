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

/**
 * 文件定位（Next.js 应用内角色）：
 * - 该文件位于 `src/server/providers/storage`，属于“服务端基础设施适配层”。
 * - 它把统一的存储抽象（`StorageProviderClient`）落到阿里云 OSS 实现，供上层 service/route handler/server action 复用。
 * - 该实现依赖 `Buffer`、Node 网络环境与 OSS SDK，不应在浏览器或 Edge Runtime 中直接执行。
 *
 * 核心业务职责：
 * - 统一对象上传、删除、读取流程，并返回上层可直接消费的 `StoredObject` 元数据。
 * - 兜底处理配置来源（构造参数与环境变量）并做必填校验，降低运行时“半配置”故障。
 * - 统一 key 规范化与公开 URL 拼接规则，保证多入口调用行为一致。
 *
 * 上下游关系：
 * - 上游：书籍上传、图片上传、资源回收等业务服务（通常从 route.ts 或 server action 触发）。
 * - 下游：阿里云 OSS 服务。
 * - 同层协作：`storage.utils.ts` 提供 key/publicBaseUrl 的标准化规则。
 */
interface OssObjectClient {
  /**
   * 上传对象。
   * - `key`：对象存储中的唯一路径键（业务侧逻辑 key，经规范化后传入）。
   * - `body`：二进制内容；这里要求 Buffer，便于统一统计 size 与避免 SDK 对多种输入分支行为差异。
   * - `options.headers`：用于透传 `Content-Type`，让下游直接携带正确 MIME。
   */
  put(
    key: string,
    body: Buffer,
    options?: {
      headers?: Record<string, string>;
    }
  ): Promise<unknown>;
  /**
   * 删除对象。
   * - 业务语义是“幂等删除”：即便对象已不存在，也不应导致上层流程失败。
   */
  delete(key: string): Promise<unknown>;
  /**
   * 下载对象。
   * - 返回体可能是 Buffer 或 Uint8Array，调用方需要归一化为 Buffer。
   */
  get(key: string): Promise<{ content?: Buffer | Uint8Array }>;
}

export interface OssStorageProviderOptions {
  /** OSS Bucket 名称。可由调用方显式传入；未传时回退环境变量。 */
  bucket?         : string;
  /** OSS 区域（如 `oss-cn-beijing`）。缺省时尝试从 endpoint 推导。 */
  region?         : string;
  /** OSS 访问端点，可传 `oss-cn-xxx.aliyuncs.com` 或完整 URL。 */
  endpoint?       : string;
  /** AccessKey ID。 */
  accessKeyId?    : string;
  /** AccessKey Secret。 */
  accessKeySecret?: string;
  /**
   * 对外可访问 URL 前缀。
   * - 例如 CDN 域名或 Bucket 公网域名；
   * - 不传则自动按 bucket + endpoint 推导默认值。
   */
  publicBaseUrl?  : string;
  /**
   * 可注入的客户端（主要用于测试替身）。
   * - 这是可测试性设计，不是业务规则；
   * - 生产环境通常不传，默认 new OSS(...)。
   */
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
  // 业务原因：统一转成 Buffer 可确保:
  // 1) 上传时输入类型稳定；
  // 2) 返回给上层的 `size` 为真实字节数，避免 string/Uint8Array 分支误差。
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
    // 这里直接抛错是“启动即失败”策略，避免运行中才暴露配置缺失。
    throw new Error("OSS_ENDPOINT is required");
  }

  if (/^https?:\/\//i.test(trimmedEndpoint)) {
    // 调用方已传完整 URL，直接使用，避免重复拼接协议头。
    return trimmedEndpoint;
  }

  // 允许仅传 host 的运维习惯，统一补 `https://`，减少配置门槛。
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
    // 显式配置优先，避免正则推导在特殊 endpoint 下失真。
    return trimmedRegion;
  }

  const matchedRegion = endpoint?.match(/(oss-[a-z0-9-]+)/i)?.[1];
  if (matchedRegion) {
    // 兼容 endpoint 自动推导，降低部署配置项数量。
    return matchedRegion.toLowerCase();
  }

  // 无法推导时必须中止，否则 OSS SDK 初始化会失败且错误信息更隐晦。
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
  // 配置优先级约定：构造参数 > 环境变量。
  // 原因：允许单次任务按需覆盖，同时保持默认部署可用。
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

  // 返回“已完成校验与归一化”的配置快照，避免后续分散判断。
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
  /** 实际 OSS 客户端，负责与对象存储网络交互。 */
  private readonly client       : OssObjectClient;
  /** 对外可访问 URL 前缀，用于把对象 key 映射成业务可返回的资源链接。 */
  private readonly publicBaseUrl: string;

  constructor(options: OssStorageProviderOptions = {}) {
    // 构造阶段完成配置决议，保证实例一旦创建就是“可工作的”。
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
    // Step 1: 规范化 key，统一防御非法路径与跨环境分隔符差异。
    const normalizedKey = normalizeStorageKey(input.key);
    // Step 2: 统一 body 为 Buffer，确保上传和 size 统计一致。
    const bodyBuffer = toBuffer(input.body);

    // Step 3: 上传到 OSS。仅在传入 contentType 时设置请求头，避免写入无意义 header。
    await this.client.put(normalizedKey, bodyBuffer, {
      headers: input.contentType
        ? { "Content-Type": input.contentType }
        : undefined
    });

    // Step 4: 返回标准化对象元数据，供上游持久化到数据库或回传前端。
    return {
      key        : normalizedKey,
      url        : this.getObjectUrl(normalizedKey),
      contentType: input.contentType ?? null,
      size       : bodyBuffer.byteLength
    };
  }

  async deleteObject(key: string): Promise<void> {
    // 删除前统一 key，避免“同一对象不同写法”导致删错或删不掉。
    const normalizedKey = normalizeStorageKey(key);

    try {
      await this.client.delete(normalizedKey);
    } catch (error) {
      // 这两个分支用于把“对象不存在”视为幂等成功。
      // 这是业务规则：删除接口通常用于清理流程，不应因为重复删除阻断主流程。
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

      // 其余错误必须抛出，让上游感知真实异常（权限、网络、服务不可用等）。
      throw error;
    }
  }

  getObjectUrl(key: string): string {
    // URL 生成同样依赖标准化 key，保证上传/删除/读取使用同一命名规则。
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
      // 风险提示：这里视“返回空 content”为异常，避免上游误把空文件当成功数据继续处理。
      throw new Error(`Failed to get object content for key: ${normalizedKey}`);
    }

    // 统一返回 Buffer，减少上游对 SDK 返回体差异的分支处理。
    return Buffer.isBuffer(content) ? content : Buffer.from(content);
  }
}
