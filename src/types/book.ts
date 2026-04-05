/**
 * 文件定位（Next.js 应用内角色）：
 * - 该文件是“书籍域共享类型层”，位于 `src/types`，在前端页面、后端 route handler、service DTO 映射中复用。
 * - 它定义了书库核心数据结构，保障前后端对字段语义的一致理解。
 *
 * 业务职责：
 * - 约束书籍状态机（PENDING/PROCESSING/COMPLETED/ERROR）；
 * - 统一书籍创建响应与列表项结构，避免各层自行拼装导致字段漂移；
 * - 明确源文件快照字段可空语义，支持“文件不可公开但可内部读取”等场景。
 */
/**
 * 功能：定义书籍源文件快照（用于书库列表与详情展示）。
 * 输入：无。
 * 输出：类型约束 BookSourceFileSnapshot。
 * 异常：无。
 * 副作用：无。
 */
export interface BookSourceFileSnapshot {
  /**
   * 文件存储键（如本地路径键或对象存储 object key）。
   * - `null` 语义：该书籍当前未绑定源文件，或历史数据尚未回填。
   */
  key : string | null;
  /**
   * 文件可访问 URL。
   * - `null` 语义：资源仅支持服务端内部读取，不对外暴露直链。
   */
  url : string | null;
  /** 原始文件名（包含扩展名，如 `儒林外史.txt`）。 */
  name: string | null;
  /** MIME 类型（如 `text/plain`），用于下载响应头与预览能力判断。 */
  mime: string | null;
  /** 文件大小（字节），可用于展示与上传校验回显。 */
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
  // 业务意义：作为运行时兜底校验，防止接口脏值进入 UI 状态分支。
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
  // 非法状态统一回退为 PENDING：
  // - 这是防御策略，确保页面至少能渲染稳定默认态；
  // - 不是最终数据修复手段，后续仍应排查上游数据来源。
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
  /** 当前书籍状态，驱动前端导入进度与可操作按钮显隐。 */
  status     : BookStatus;
  /** 导入源文件快照，供上传回执和详情页展示。 */
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
  /** 封面图 URL（可空），为空时前端应展示默认占位。 */
  coverUrl        : string | null;
  /** 当前状态，决定卡片操作入口与状态徽标。 */
  status          : BookStatus;
  /** 章节总数（用于判断是否完成切分/解析）。 */
  chapterCount    : number;
  /** 人物总数（按有效未删除记录统计，用于反映解析产出规模）。 */
  personaCount    : number;
  /** 最近一次解析完成时间（ISO 字符串，可空）。 */
  lastAnalyzedAt  : string | null;
  /** 当前生效模型名称（可空），用于回溯分析结果来源。 */
  currentModel    : string | null;
  /** 最近错误摘要（可空），用于列表层快速诊断失败原因。 */
  lastErrorSummary: string | null;
  /** 创建时间（ISO 字符串）。 */
  createdAt       : string;
  /** 更新时间（ISO 字符串）。 */
  updatedAt       : string;
  /** 源文件快照。 */
  sourceFile      : BookSourceFileSnapshot;
}
