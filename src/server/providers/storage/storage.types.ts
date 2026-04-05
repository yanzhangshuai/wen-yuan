/**
 * 文件定位（对象存储抽象类型契约）：
 * - 文件路径：`src/server/providers/storage/storage.types.ts`
 * - 所属层次：服务端基础设施抽象层（Storage Provider SPI）。
 *
 * 核心职责：
 * - 约束本地存储、OSS 等不同实现的统一输入输出；
 * - 让上游业务逻辑只依赖接口，不依赖具体云厂商 SDK。
 */

/**
 * 对象写入内容类型。
 * 业务语义：覆盖二进制缓冲、字节数组、文本三类常见上传来源。
 */
export type StorageObjectBody = Buffer | Uint8Array | string;

/**
 * 写对象入参。
 * 字段语义：
 * - `key`：对象唯一存储路径（由业务侧约定命名规则）；
 * - `body`：对象实体内容；
 * - `contentType`：MIME 类型，可选，缺失时由下游实现或网关推断。
 */
export interface PutObjectInput {
  key         : string;
  body        : StorageObjectBody;
  contentType?: string | null;
}

/**
 * 写对象后返回的元信息。
 * 字段语义：
 * - `key`：对象存储键；
 * - `url`：可访问地址（公开或签名地址，取决于实现）；
 * - `contentType`：最终记录的 MIME 类型；
 * - `size`：对象字节大小，便于上游做配额与展示。
 */
export interface StoredObject {
  key        : string;
  url        : string;
  contentType: string | null;
  size       : number;
}

/**
 * 存储客户端统一接口。
 * 这是业务规则，不是技术限制：
 * - 所有 Provider 必须满足该契约，才能无缝替换。
 */
export interface StorageProviderClient {
  /** 上传对象并返回存储结果。 */
  putObject(input: PutObjectInput): Promise<StoredObject>;
  /** 删除指定对象键。 */
  deleteObject(key: string): Promise<void>;
  /** 基于对象键计算可访问 URL。 */
  getObjectUrl(key: string): string;
  /**
   * 功能：从对象存储读取对象内容。
   * 输入：key，对象存储键值。
   * 输出：原始二进制 Buffer。
   * 异常：对象不存在时抛错。
   * 副作用：网络或磁盘 I/O。
   */
  getObject(key: string): Promise<Buffer>;
}

/** 存储客户端工厂函数类型。 */
export type StorageClientFactory = () => StorageProviderClient;

/** 当前支持的存储提供商名称。 */
export type StorageProviderName = "local" | "oss";
