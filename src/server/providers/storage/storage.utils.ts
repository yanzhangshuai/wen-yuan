import path from "node:path";

export const DEFAULT_STORAGE_ROOT = "storage";
export const DEFAULT_STORAGE_PUBLIC_BASE_URL = "/api/assets";

/**
 * 功能：将逻辑对象 key 规范化为可安全落盘和拼接 URL 的路径。
 * 输入：key，为业务层传入的对象标识。
 * 输出：标准化后的相对 key，如 `books/a/source/original.txt`。
 * 异常：当 key 为空、试图目录穿越或指向目录时抛错。
 * 副作用：无。
 */
export function normalizeStorageKey(key: string): string {
  const normalizedKey = path.posix.normalize(key.trim().replaceAll("\\", "/")).replace(/^\/+/, "");

  if (!normalizedKey || normalizedKey === "." || normalizedKey.endsWith("/")) {
    throw new Error(`Invalid storage object key: ${key}`);
  }

  if (normalizedKey.startsWith("../") || normalizedKey.includes("/../")) {
    throw new Error(`Invalid storage object key: ${key}`);
  }

  return normalizedKey;
}

/**
 * 功能：解析本地存储根目录，统一兼容相对路径与绝对路径配置。
 * 输入：rootDirectory，为环境变量或调用方传入的存储根目录。
 * 输出：绝对路径形式的存储根目录。
 * 异常：无。
 * 副作用：读取 process.cwd()。
 */
export function resolveLocalStorageRoot(
  rootDirectory = process.env.STORAGE_LOCAL_ROOT || DEFAULT_STORAGE_ROOT
): string {
  return path.resolve(process.cwd(), rootDirectory);
}

/**
 * 功能：将逻辑对象 key 映射为安全的本地文件路径。
 * 输入：key，为逻辑对象 key；rootDirectory，为本地存储根目录。
 * 输出：绝对文件路径。
 * 异常：当 key 试图越过存储根目录时抛错。
 * 副作用：无。
 */
export function resolveLocalStorageFilePath(
  key: string,
  rootDirectory = process.env.STORAGE_LOCAL_ROOT || DEFAULT_STORAGE_ROOT
): string {
  const normalizedKey = normalizeStorageKey(key);
  const normalizedRootDirectory = resolveLocalStorageRoot(rootDirectory);
  const targetPath = path.resolve(normalizedRootDirectory, normalizedKey);
  const relativePath = path.relative(normalizedRootDirectory, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error(`Invalid storage object key: ${key}`);
  }

  return targetPath;
}

/**
 * 功能：将外部可访问的资源前缀统一为稳定 URL。
 * 输入：publicBaseUrl，环境变量或构造参数中的公开访问前缀。
 * 输出：去除尾部斜杠后的访问前缀。
 * 异常：无。
 * 副作用：无。
 */
export function normalizeStoragePublicBaseUrl(
  publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL || DEFAULT_STORAGE_PUBLIC_BASE_URL
): string {
  const trimmedBaseUrl = publicBaseUrl.trim();
  if (!trimmedBaseUrl) {
    return DEFAULT_STORAGE_PUBLIC_BASE_URL;
  }

  return trimmedBaseUrl.replace(/\/+$/, "") || DEFAULT_STORAGE_PUBLIC_BASE_URL;
}

/**
 * 功能：根据逻辑对象 key 生成稳定的对外访问 URL。
 * 输入：key，为逻辑对象 key；publicBaseUrl，为访问前缀。
 * 输出：对外访问 URL。
 * 异常：当 key 非法时抛错。
 * 副作用：无。
 */
export function buildStorageObjectUrl(
  key: string,
  publicBaseUrl = process.env.STORAGE_PUBLIC_BASE_URL || DEFAULT_STORAGE_PUBLIC_BASE_URL
): string {
  const normalizedKey = normalizeStorageKey(key);
  const normalizedPublicBaseUrl = normalizeStoragePublicBaseUrl(publicBaseUrl);

  return `${normalizedPublicBaseUrl}/${normalizedKey}`;
}

/**
 * 功能：根据文件后缀推断基础 Content-Type，便于本地资产 route 返回响应头。
 * 输入：key，为逻辑对象 key。
 * 输出：推断出的 Content-Type。
 * 异常：当 key 非法时抛错。
 * 副作用：无。
 */
export function inferContentTypeFromKey(key: string): string {
  const extension = path.extname(normalizeStorageKey(key)).toLowerCase();

  switch (extension) {
    case ".txt":
      return "text/plain; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".svg":
      return "image/svg+xml";
    default:
      return "application/octet-stream";
  }
}
