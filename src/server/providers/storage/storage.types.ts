export type StorageObjectBody = Buffer | Uint8Array | string;

export interface PutObjectInput {
  key         : string;
  body        : StorageObjectBody;
  contentType?: string | null;
}

export interface StoredObject {
  key        : string;
  url        : string;
  contentType: string | null;
  size       : number;
}

export interface StorageProviderClient {
  putObject(input: PutObjectInput): Promise<StoredObject>;
  deleteObject(key: string): Promise<void>;
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

export type StorageClientFactory = () => StorageProviderClient;

export type StorageProviderName = "local" | "oss";
