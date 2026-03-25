import { LocalStorageProvider } from "@/server/providers/storage/localStorageProvider";
import type {
  StorageClientFactory,
  StorageProviderClient,
  StorageProviderName
} from "@/server/providers/storage/storage.types";

export { LocalStorageProvider } from "@/server/providers/storage/localStorageProvider";

export type {
  PutObjectInput,
  StorageClientFactory,
  StorageObjectBody,
  StorageProviderClient,
  StorageProviderName,
  StoredObject
} from "@/server/providers/storage/storage.types";

const defaultStorageFactories: Record<StorageProviderName, StorageClientFactory> = {
  local: () => new LocalStorageProvider(),
  oss  : () => {
    throw new Error("OSS storage provider is not implemented yet");
  }
};

/**
 * 功能：按 provider 名称创建对象存储客户端。
 * 输入：provider - provider 名（默认取 STORAGE_PROVIDER 或 local）；factories - 可注入工厂映射。
 * 输出：StorageProviderClient 实例。
 * 异常：provider 不受支持或 provider 尚未实现时抛错。
 * 副作用：可能触发具体 provider 初始化与环境变量读取。
 */
export function provideStorage(
  provider = process.env.STORAGE_PROVIDER,
  factories: Record<string, StorageClientFactory> = defaultStorageFactories
): StorageProviderClient {
  const normalizedProvider = (provider || "local").toLowerCase();
  const factory = factories[normalizedProvider];

  if (!factory) {
    throw new Error(`Unsupported STORAGE_PROVIDER: ${normalizedProvider}`);
  }

  return factory();
}
