/**
 * ============================================================================
 * 文件定位：`src/lib/services/books.ts`
 * ----------------------------------------------------------------------------
 * 这是书籍域（books domain）的前端服务层，负责把组件交互转换为 `/api/books/*` 请求。
 *
 * 在 Next.js 应用中的角色：
 * - 非路由文件，不直接参与 App Router 约定；
 * - 属于“前端数据访问层”，主要被 Client Component、管理台页面和图谱侧栏调用；
 * - 通过 `clientFetch/clientMutate` 统一错误处理与响应解包，减少组件中的网络样板代码。
 *
 * 业务职责：
 * - 书籍创建、章节预览与确认、AI 解析任务启动/重启/重跑；
 * - 书籍状态、任务列表、人物列表查询；
 * - 阅读面板的章节正文读取与轻量数据映射。
 *
 * 上下游关系：
 * - 上游：表单输入（上传文件、章节确认、解析范围）、路由参数（bookId/chapterId）；
 * - 下游：`/api/books/*` 路由与其 server modules；
 * - 输出：前端可直接消费的数据结构（避免组件关心后端细节命名）。
 *
 * 维护边界（业务规则）：
 * - `encodeURIComponent(bookId/chapterId)` 不能去掉，这是路由安全边界；
 * - `fetchChapterContent` 的字段映射（chapterTitle -> title）是前端契约，改名会影响阅读面板。
 * ============================================================================
 */
import { clientFetch, clientMutate } from "@/lib/client-api";
import type { ModelStrategyInput } from "@/lib/services/model-strategy";
import type { AnalysisArchitecture } from "@/types/analysis-pipeline";

export type { AnalysisArchitecture } from "@/types/analysis-pipeline";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 创建书籍成功数据。
 * 对应 `POST /api/books` 返回体中的 `data`。
 */
export interface CreatedBookData {
  /** 新建书籍主键（后续所有操作的核心标识）。 */
  id   : string;
  /** 书籍标题（创建时识别或输入的结果）。 */
  title: string;
}

/**
 * 章节预览条目。
 * 用于“章节确认”流程中给用户展示切分结果。
 */
export interface ChapterPreviewItem {
  /** 章节顺序索引（与原文切分顺序一致）。 */
  index      : number;
  /** 章节类型（序章/正文章节/尾声）。 */
  chapterType: string;
  /** 章节标题。 */
  title      : string;
  /** 字数统计，用于人工校对切分是否合理。 */
  wordCount  : number;
}

/**
 * 可确认章节类型。
 * 这是业务枚举，不是技术限制，需与后端 `ChapterType` 保持一致。
 */
export type ChapterType = "PRELUDE" | "CHAPTER" | "POSTLUDE";

/**
 * 章节确认请求项。
 * 前端把预览项编辑后提交给后端落库。
 */
export interface ConfirmChapterItem {
  /** 章节顺序索引。 */
  index      : number;
  /** 业务章节类型。 */
  chapterType: ChapterType;
  /** 用户确认后的章节标题。 */
  title      : string;
  /** 可选章节正文；允许 null 表示“仅确认结构，正文另行处理”。 */
  content?   : string | null;
}

/**
 * 解析范围。
 * 决定 AI 任务处理整本书、连续区间或离散章节。
 */
export type AnalyzeScope = "FULL_BOOK" | "CHAPTER_RANGE" | "CHAPTER_LIST";

interface StartAnalysisBase {
  /** 解析架构：顺序或两遍式。 */
  architecture? : AnalysisArchitecture;
  /** 任务级模型策略覆盖。 */
  modelStrategy?: { stages: ModelStrategyInput };
}

/**
 * 启动解析任务请求体（判别联合类型）。
 *
 * 设计原因：
 * - 通过 `scope` 作为判别字段，保证不同模式下必填参数不同；
 * - `modelStrategy` 可选，允许任务临时覆盖默认模型策略；
 * - 未传 `modelStrategy` 时，后端按书籍绑定 -> 全局 -> 系统默认逐级回退。
 */
export type StartAnalysisBody =
  | ({ scope: "FULL_BOOK" } & StartAnalysisBase)
  | ({ scope: "CHAPTER_RANGE"; chapterStart: number; chapterEnd: number } & StartAnalysisBase)
  | ({ scope: "CHAPTER_LIST"; chapterIndices: number[] } & StartAnalysisBase);

/**
 * 阅读面板使用的章节内容模型（前端视图模型）。
 */
export interface ChapterContent {
  /** 展示标题（来自后端 chapterTitle）。 */
  title     : string;
  /** 章节序号。 */
  chapterNo : number;
  /** 段落纯文本数组（用于渲染与高亮）。 */
  paragraphs: string[];
}

/**
 * 后端阅读接口原始 payload。
 * 该接口结构与前端显示结构不同，因此需要映射。
 */
interface ChapterReadPayload {
  /** 章节序号。 */
  chapterNo   : number;
  /** 后端章节标题字段名。 */
  chapterTitle: string;
  /** 段落对象数组，前端只消费 text。 */
  paragraphs  : { text: string }[];
}

/**
 * 书籍解析状态快照。
 * 对应 `GET /api/books/:bookId/status` 的 `data`。
 */
export interface BookStatusSnapshot {
  /** 解析状态机当前状态（字符串枚举由后端控制）。 */
  status   : string;
  /** 进度百分比（0~100）。 */
  progress : number;
  /** 当前阶段标识，可选。 */
  stage?   : string;
  /** 错误摘要，可选。 */
  errorLog?: string;
  /** 章节级状态列表，可选（parseStatus: PENDING/PROCESSING/SUCCEEDED/FAILED/REVIEW_PENDING）。 */
  chapters?: Array<{ no: number; title: string; parseStatus: string }>;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 上传书籍文件并创建书籍记录。
 * 对应接口：`POST /api/books`（`multipart/form-data`）。
 *
 * @param formData 上传表单（通常包含文件与基础元数据）
 * @returns 新建书籍基础信息
 */
export async function createBook(formData: FormData): Promise<CreatedBookData> {
  return clientFetch<CreatedBookData>("/api/books", {
    method: "POST",
    body  : formData
  });
}

/**
 * 获取章节识别预览列表。
 * 对应接口：`GET /api/books/:bookId/chapters/preview`。
 *
 * @param bookId 书籍 ID（来自页面路由或选中记录）
 * @returns 预览条目数组（用于人工确认）
 */
export async function fetchChapterPreview(bookId: string): Promise<ChapterPreviewItem[]> {
  const data = await clientFetch<{ items: ChapterPreviewItem[] }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/preview`
  );
  return data.items;
}

/**
 * 提交章节确认结果并落库。
 * 对应接口：`POST /api/books/:bookId/chapters/confirm`。
 *
 * @param bookId 书籍 ID
 * @param items 用户确认后的章节条目
 */
export async function confirmBookChapters(
  bookId: string,
  items: ConfirmChapterItem[]
): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}/chapters/confirm`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ items })
  });
}

/**
 * 启动 AI 解析任务（后台异步执行）。
 * 对应接口：`POST /api/books/:bookId/analyze`。
 *
 * @param bookId 书籍 ID
 * @param body 解析范围与可选模型策略
 */
export async function startAnalysis(bookId: string, body: StartAnalysisBody): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}/analyze`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 获取一本书的解析状态快照。
 * 对应接口：`GET /api/books/:bookId/status`。
 *
 * @param bookId 书籍 ID
 * @returns 状态、进度、阶段、错误摘要等信息
 */
export async function fetchBookStatus(bookId: string): Promise<BookStatusSnapshot> {
  return clientFetch<BookStatusSnapshot>(
    `/api/books/${encodeURIComponent(bookId)}/status`
  );
}

/**
 * 重新触发全书解析。
 * 对应接口：`POST /api/books/:bookId/analyze`。
 * 请求体为空对象，业务语义是“按默认 FULL_BOOK 规则重跑”。
 */
export async function restartAnalysis(bookId: string): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}/analyze`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({})
  });
}

/**
 * 仅重跑指定章节列表。
 * 对应接口：`POST /api/books/:bookId/analyze`，`scope=CHAPTER_LIST`。
 *
 * @param bookId 书籍 ID
 * @param chapterIndices 需要重跑的章节序号列表
 */
export async function reanalyzeChapters(bookId: string, chapterIndices: number[]): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}/analyze`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ scope: "CHAPTER_LIST", chapterIndices })
  });
}

/**
 * 删除一本书。
 * 对应接口：`DELETE /api/books/:bookId`。
 *
 * 说明：这里不处理 UI 确认弹窗，调用前由上层流程保证二次确认。
 */
export async function deleteBookById(bookId: string): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "DELETE"
  });
}

/**
 * BookTypeCode 可选值（与后端 `BookTypeCode` 枚举一致）。
 *
 * 前端不直接复用 `@/generated/prisma/enums` 以避免把 Prisma 运行时体积带入浏览器包。
 * 如需与后端同步，请同时修改本联合类型和 `src/app/api/admin/books/[id]/_shared.ts`。
 */
export type BookTypeCode =
  | "CLASSICAL_NOVEL"
  | "HEROIC_NOVEL"
  | "HISTORICAL_NOVEL"
  | "MYTHOLOGICAL_NOVEL"
  | "GENERIC";

/** BookTypeCode 下拉选项（按管理台习惯排序，GENERIC 垫底）。 */
export const BOOK_TYPE_CODE_OPTIONS: { value: BookTypeCode; label: string; description: string }[] = [
  { value: "CLASSICAL_NOVEL",    label: "古典世情/讽刺小说", description: "儒林外史、红楼梦、金瓶梅" },
  { value: "HEROIC_NOVEL",       label: "英雄侠义小说",     description: "水浒传、三侠五义" },
  { value: "HISTORICAL_NOVEL",   label: "历史演义",         description: "三国演义、东周列国志" },
  { value: "MYTHOLOGICAL_NOVEL", label: "神魔小说",         description: "西游记、封神演义" },
  { value: "GENERIC",            label: "未分类/其他",      description: "默认兜底类型" }
];

/**
 * 管理端 `PATCH /api/admin/books/:id` 成功返回的数据片段。
 */
export interface UpdatedBookTypeCodeData {
  /** 书籍主键。 */
  id       : string;
  /** 书名（用于 toast 回显）。 */
  title    : string;
  /** 更新后的 BookTypeCode。 */
  typeCode : BookTypeCode;
  /** 更新时间（ISO 字符串）。 */
  updatedAt: string;
}

/**
 * 调用 `PATCH /api/admin/books/:bookId` 更新 `typeCode` 字段。
 *
 * 业务约束：
 * - 仅 ADMIN 可调用（后端鉴权拦截，前端按钮也需置于管理台入口）；
 * - 修改成功后前端应提示“需要 re-run 才生效”。
 */
export async function updateAdminBookTypeCode(
  bookId: string,
  typeCode: BookTypeCode
): Promise<UpdatedBookTypeCodeData> {
  return clientFetch<UpdatedBookTypeCodeData>(`/api/admin/books/${encodeURIComponent(bookId)}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ typeCode })
  });
}

/**
 * 解析任务列表项。
 * 对应 `GET /api/books/:bookId/jobs` 返回的单条任务。
 */
export interface AnalysisJobListItem {
  /** 任务 ID。 */
  id            : string;
  /** 任务状态。 */
  status        : string;
  /** 解析架构。 */
  architecture  : AnalysisArchitecture;
  /** 任务范围类型。 */
  scope         : string;
  /** 章节区间起点（scope=CHAPTER_RANGE 时有效）。 */
  chapterStart  : number | null;
  /** 章节区间终点（scope=CHAPTER_RANGE 时有效）。 */
  chapterEnd    : number | null;
  /** 离散章节列表（scope=CHAPTER_LIST 时有效）。 */
  chapterIndices: number[];
  /** 重试次数/尝试序号。 */
  attempt       : number;
  /** 错误日志摘要。 */
  errorLog      : string | null;
  /** 开始时间。 */
  startedAt     : string | null;
  /** 完成时间。 */
  finishedAt    : string | null;
  /** 创建时间。 */
  createdAt     : string;
  /** 本次任务使用的模型名。 */
  aiModelName   : string | null;
}

/**
 * 书籍人物列表项（前端展示模型）。
 * 镜像服务端 DTO，但移除了 Prisma 枚举依赖，避免客户端打包 Prisma 类型。
 */
export interface BookPersonaListItem {
  /** 人物 ID。 */
  id           : string;
  /** 当前书内档案 ID。 */
  profileId    : string;
  /** 所属书籍 ID。 */
  bookId       : string;
  /** 人物标准名。 */
  name         : string;
  /** 书内称谓。 */
  localName    : string;
  /** 别名列表。 */
  aliases      : string[];
  /** 性别。 */
  gender       : string | null;
  /** 籍贯。 */
  hometown     : string | null;
  /** 姓名类型。 */
  nameType     : string;
  /** 全局标签。 */
  globalTags   : string[];
  /** 书内标签。 */
  localTags    : string[];
  /** 书内官职头衔。 */
  officialTitle: string | null;
  /** 书内摘要。 */
  localSummary : string | null;
  /** 书内讽刺指数。 */
  ironyIndex   : number;
  /** 置信度。 */
  confidence   : number;
  /** 数据来源。 */
  recordSource : string;
  /** 审核状态。 */
  status       : string;
}

/**
 * 获取书籍解析任务记录列表（通常按时间倒序）。
 * 对应接口：`GET /api/books/:bookId/jobs`。
 */
export async function fetchBookJobs(bookId: string): Promise<AnalysisJobListItem[]> {
  return clientFetch<AnalysisJobListItem[]>(
    `/api/books/${encodeURIComponent(bookId)}/jobs`
  );
}

/**
 * 获取指定书籍的人物列表。
 * 对应接口：`GET /api/books/:bookId/personas`。
 */
export async function fetchBookPersonas(bookId: string): Promise<BookPersonaListItem[]> {
  return clientFetch<BookPersonaListItem[]>(
    `/api/books/${encodeURIComponent(bookId)}/personas`
  );
}

/**
 * 获取章节正文段落并映射为前端阅读模型。
 * 对应接口：`GET /api/books/:bookId/chapters/:chapterId/read`。
 *
 * 关键分支说明：
 * - `paraIndex` 仅在提供时拼接 query，避免把 `undefined` 传到服务端；
 * - 返回时把后端段落对象数组映射成纯文本数组，降低阅读组件复杂度。
 *
 * @param bookId 书籍 ID
 * @param chapterId 章节 ID
 * @param paraIndex 可选段落定位（用于证据跳转高亮）
 */
export async function fetchChapterContent(
  bookId: string,
  chapterId: string,
  paraIndex?: number
): Promise<ChapterContent> {
  const params = new URLSearchParams();
  if (typeof paraIndex === "number") {
    params.set("paraIndex", String(paraIndex));
  }

  const query = params.toString();
  const data = await clientFetch<ChapterReadPayload>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/${encodeURIComponent(chapterId)}/read${query ? `?${query}` : ""}`
  );

  return {
    title     : data.chapterTitle,
    chapterNo : data.chapterNo,
    paragraphs: data.paragraphs.map(item => item.text)
  };
}
