import { LocalStorageProvider } from "@/server/providers/storage/localStorageProvider";
import { OssStorageProvider } from "@/server/providers/storage/ossStorageProvider";
import type {
  StorageClientFactory,
  StorageProviderClient,
  StorageProviderName
} from "@/server/providers/storage/storage.types";

/**
 * 文件定位：
 * - 对象存储提供器门面（Facade），属于服务端基础设施层。
 * - 负责把“环境配置中的 provider 名称”映射到具体实现（local / oss）。
 *
 * 设计意图：
 * - 业务层依赖抽象接口 `StorageProviderClient`，而不是某个具体云厂商 SDK。
 * - 通过工厂映射便于测试注入 mock，也便于后续扩展新 provider。
 */

export { LocalStorageProvider } from "@/server/providers/storage/localStorageProvider";
export { OssStorageProvider } from "@/server/providers/storage/ossStorageProvider";

export type {
  PutObjectInput,
  StorageClientFactory,
  StorageObjectBody,
  StorageProviderClient,
  StorageProviderName,
  StoredObject
} from "@/server/providers/storage/storage.types";

/**
 * 默认 provider 工厂表。
 * - key：存储提供器名称（业务配置项）。
 * - value：延迟创建客户端实例的函数。
 */
const defaultStorageFactories: Record<StorageProviderName, StorageClientFactory> = {
  local: () => new LocalStorageProvider(),
  oss  : () => new OssStorageProvider()
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
  // 统一标准化：允许环境变量大小写差异，避免部署配置细节导致运行失败。
  const normalizedProvider = (provider || "local").toLowerCase();
  const factory = factories[normalizedProvider];

  if (!factory) {
    // 显式抛错优于静默回退，可在启动或首个调用时快速暴露配置问题。
    throw new Error(`Unsupported STORAGE_PROVIDER: ${normalizedProvider}`);
  }

  // 由工厂按需创建实例，避免未使用 provider 在启动阶段提前初始化。
  return factory();
}
