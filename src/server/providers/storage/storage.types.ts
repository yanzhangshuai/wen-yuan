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
}

export type StorageClientFactory = () => StorageProviderClient;

export type StorageProviderName = "local" | "oss";
