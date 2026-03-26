/**
 * 功能：定义书籍源文件快照（用于书库列表与详情展示）。
 * 输入：无。
 * 输出：类型约束 BookSourceFileSnapshot。
 * 异常：无。
 * 副作用：无。
 */
export interface BookSourceFileSnapshot {
  /** 文件存储键（如本地路径键或对象存储 object key）。 */
  key : string | null;
  /** 文件可访问 URL（可为空，表示仅内部可读）。 */
  url : string | null;
  /** 原始文件名（包含扩展名，如 `儒林外史.txt`）。 */
  name: string | null;
  /** MIME 类型（如 `text/plain`）。 */
  mime: string | null;
  /** 文件大小（字节）。 */
  size: number | null;
}

/**
 * 功能：定义书籍状态白名单常量。
 * 输入：无。
 * 输出：只读状态数组。
 * 异常：无。
 * 副作用：无。
 */
export const BOOK_STATUS_VALUES = [
  "PENDING",
  "PROCESSING",
  "COMPLETED",
  "ERROR"
] as const;

/**
 * 功能：定义书籍状态联合类型。
 * 输入：无。
 * 输出：`PENDING | PROCESSING | COMPLETED | ERROR`。
 * 异常：无。
 * 副作用：无。
 */
export type BookStatus = (typeof BOOK_STATUS_VALUES)[number];

/**
 * 功能：判断字符串是否是合法书籍状态。
 * 输入：value - 任意字符串。
 * 输出：类型守卫结果（true 时自动收窄为 BookStatus）。
 * 异常：无。
 * 副作用：无。
 */
export function isBookStatus(value: string): value is BookStatus {
  return BOOK_STATUS_VALUES.includes(value as BookStatus);
}

/**
 * 功能：将任意字符串归一化为合法书籍状态。
 * 输入：value - 状态原始值。
 * 输出：合法 BookStatus；不合法时回退 `PENDING`。
 * 异常：无。
 * 副作用：无。
 */
export function normalizeBookStatus(value: string): BookStatus {
  return isBookStatus(value) ? value : "PENDING";
}

/**
 * 功能：定义创建书籍接口成功返回的数据结构。
 * 输入：无。
 * 输出：类型约束 CreateBookResponseData。
 * 异常：无。
 * 副作用：无。
 */
export interface CreateBookResponseData {
  /** 书籍主键 UUID。 */
  id         : string;
  /** 书名（必填，已归一化）。 */
  title      : string;
  /** 作者（可空）。 */
  author     : string | null;
  /** 朝代（可空）。 */
  dynasty    : string | null;
  /** 简介（可空）。 */
  description: string | null;
  /** 当前书籍状态。 */
  status     : BookStatus;
  /** 导入源文件快照。 */
  sourceFile : BookSourceFileSnapshot;
}

/**
 * 功能：定义书库列表卡片数据结构。
 * 输入：无。
 * 输出：类型约束 BookLibraryListItem。
 * 异常：无。
 * 副作用：无。
 */
export interface BookLibraryListItem {
  /** 书籍主键 UUID。 */
  id              : string;
  /** 书名。 */
  title           : string;
  /** 作者（可空）。 */
  author          : string | null;
  /** 朝代（可空）。 */
  dynasty         : string | null;
  /** 封面图 URL（可空）。 */
  coverUrl        : string | null;
  /** 当前状态。 */
  status          : BookStatus;
  /** 章节总数。 */
  chapterCount    : number;
  /** 人物总数（按有效未删除记录统计）。 */
  personaCount    : number;
  /** 最近一次解析完成时间（ISO 字符串，可空）。 */
  lastAnalyzedAt  : string | null;
  /** 当前生效模型名称（可空）。 */
  currentModel    : string | null;
  /** 最近错误摘要（可空）。 */
  lastErrorSummary: string | null;
  /** 创建时间（ISO 字符串）。 */
  createdAt       : string;
  /** 更新时间（ISO 字符串）。 */
  updatedAt       : string;
  /** 源文件快照。 */
  sourceFile      : BookSourceFileSnapshot;
}
