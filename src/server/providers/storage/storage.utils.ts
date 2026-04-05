import path from "node:path";

/**
 * 文件定位（Next.js 应用内角色）：
 * - 该文件属于服务端存储公共工具层，被本地存储 provider、OSS provider、资产 route handler 共同依赖。
 * - 它不直接处理业务流程，而是提供“路径与 URL 规范化规则”，保证不同调用入口行为一致。
 *
 * 核心价值：
 * - 避免目录穿越与非法 key；
 * - 统一存储 key、落盘路径、公开 URL 的映射规则；
 * - 统一日期分段与文件名清洗，降低上游重复实现与规则漂移风险。
 *
 * 运行环境说明：
 * - 使用 `node:path`，因此应在 Node.js 服务端执行；
 * - 典型调用点包括 Next.js 的 route.ts、server action、后端 service，不面向浏览器端直接调用。
 */
export const DEFAULT_STORAGE_ROOT = "storage";
export const DEFAULT_STORAGE_PUBLIC_BASE_URL = "/api/assets";

/**
 * 存储目录业务枚举：
 * - `books`：书籍源文件、切分结果等文本资产；
 * - `images`：封面、插图等图片资产。
 * 这是当前业务约束，不是技术限制；若新增目录，应同步审查上游读取/清理策略。
 */
export type StorageDatedDirectory = "books" | "images";

/**
 * 功能：将逻辑对象 key 规范化为可安全落盘和拼接 URL 的路径。
 * 输入：key，为业务层传入的对象标识。
 * 输出：标准化后的相对 key，如 `books/a/source/original.txt`。
 * 异常：当 key 为空、试图目录穿越或指向目录时抛错。
 * 副作用：无。
 */
export function normalizeStorageKey(key: string): string {
  // 先做统一归一化：
  // 1) trim 去掉用户输入首尾空白；
  // 2) 反斜杠转斜杠，兼容 Windows 路径写法；
  // 3) posix.normalize 规整重复分隔符与 `.` 片段；
  // 4) 去掉前导 `/`，确保 key 始终是相对逻辑路径。
  const normalizedKey = path.posix.normalize(key.trim().replaceAll("\\", "/")).replace(/^\/+/, "");

  if (!normalizedKey || normalizedKey === "." || normalizedKey.endsWith("/")) {
    // 业务原因：key 必须指向“对象”，而不是空值或目录。
    throw new Error(`Invalid storage object key: ${key}`);
  }

  if (normalizedKey.startsWith("../") || normalizedKey.includes("/../")) {
    // 安全边界：禁止目录穿越，避免越权读写根目录之外的文件。
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
  // 统一转成绝对路径，避免调用方在不同 cwd 下出现落盘位置漂移。
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
  // Step 1: 对 key 做安全归一化，先挡住明显非法输入。
  const normalizedKey = normalizeStorageKey(key);
  // Step 2: 解析存储根目录绝对路径。
  const normalizedRootDirectory = resolveLocalStorageRoot(rootDirectory);
  // Step 3: 拼接目标路径并做相对路径校验。
  const targetPath = path.resolve(normalizedRootDirectory, normalizedKey);
  const relativePath = path.relative(normalizedRootDirectory, targetPath);

  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    // 双重防御：即便 key 经过 normalize，这里仍通过 relative 二次确认未逃逸根目录。
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
    // 空配置时回退默认值，保障资源 URL 至少可被本地 `/api/assets` 路由承接。
    return DEFAULT_STORAGE_PUBLIC_BASE_URL;
  }

  // 去掉尾部 `/`，防止后续拼接出现 `//`。
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
  // key 与 baseUrl 都先归一化，确保任意调用方拿到一致 URL 结构。
  const normalizedKey = normalizeStorageKey(key);
  const normalizedPublicBaseUrl = normalizeStoragePublicBaseUrl(publicBaseUrl);

  return `${normalizedPublicBaseUrl}/${normalizedKey}`;
}

/**
 * 功能：将日期格式化为 `YYYYMMDD`，用于对象存储的按日分桶目录。
 * 输入：date，可选，默认当前时间。
 * 输出：8 位日期字符串，如 `20260328`。
 * 异常：无。
 * 副作用：无。
 */
export function formatStorageDateSegment(date = new Date()): string {
  // 使用本地时间构建 YYYYMMDD，便于按“业务日期”进行目录归档与排查。
  // 风险提示：跨时区部署时可能与预期业务时区不一致，后续可按需求改为固定时区格式化。
  const year = String(date.getFullYear());
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}${month}${day}`;
}

/**
 * 功能：清理文件名中的路径片段，避免文件名被解释为嵌套目录。
 * 输入：fileName，上传侧传入的原始文件名。
 * 输出：可用于 key 尾段的安全文件名。
 * 异常：无。
 * 副作用：无。
 */
export function sanitizeStorageFileName(fileName: string): string {
  // 仅保留 basename，主动丢弃调用方传入的路径层级，避免“伪造子目录”。
  const baseName = path.posix.basename(fileName.trim().replaceAll("\\", "/"));
  // 空文件名回退为 `unnamed`，避免后续生成非法 key。
  return baseName || "unnamed";
}

/**
 * 功能：构造“目录/日期/文件”格式的对象 key。
 * 输入：directory（books/images）、fileName、可选 date 与 uniquePrefix。
 * 输出：规范化后的对象 key。
 * 异常：当参数非法或 key 非法时抛错。
 * 副作用：无。
 */
export function buildDatedStorageKey(input: {
  /** 业务分桶目录，当前仅允许 books/images。 */
  directory    : StorageDatedDirectory;
  /** 原始文件名，可能来自用户上传或上游生成。 */
  fileName     : string;
  /** 可选日期，默认当前时间；用于回放历史任务时保持目录可复现。 */
  date?        : Date;
  /** 可选唯一前缀（如 UUID/任务号），用于防重名覆盖。 */
  uniquePrefix?: string;
}): string {
  // Step 1: 生成日期目录段，便于按天归档与清理。
  const dateSegment = formatStorageDateSegment(input.date);
  // Step 2: 清理文件名，避免将路径片段写入 key。
  const normalizedFileName = sanitizeStorageFileName(input.fileName);
  // Step 3: 在业务需要时添加唯一前缀，控制同名冲突。
  const fileNameWithPrefix = input.uniquePrefix
    ? `${input.uniquePrefix}-${normalizedFileName}`
    : normalizedFileName;

  // Step 4: 通过 normalizeStorageKey 统一做最终合法性校验。
  return normalizeStorageKey(`${input.directory}/${dateSegment}/${fileNameWithPrefix}`);
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
      // 兜底为二进制流，避免错误声明类型导致浏览器误解析。
      return "application/octet-stream";
  }
}
