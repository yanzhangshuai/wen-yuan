/**
 * @module books
 * @description 书籍（Book）客户端服务层
 *
 * 封装书籍导入与解析流程相关的 HTTP 请求，对应后端路由 `/api/books/*`。
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 创建书籍成功后的响应数据。
 * 对应 POST /api/books 响应中的 data 字段。
 */
export interface CreatedBookData {
  id   : string;
  title: string;
}

/**
 * 章节预览条目。
 * 对应 GET /api/books/:id/chapters/preview 响应中 data.items 的单个元素。
 */
export interface ChapterPreviewItem {
  index      : number;
  chapterType: string;
  title      : string;
  wordCount  : number;
}

/**
 * 可确认的章节类型枚举（与后端 ChapterType 保持一致）。
 */
export type ChapterType = "PRELUDE" | "CHAPTER" | "POSTLUDE";

/**
 * 章节确认请求体单项。
 */
export interface ConfirmChapterItem {
  index      : number;
  chapterType: ChapterType;
  title      : string;
  content?   : string | null;
}

/**
 * 解析范围枚举。
 */
export type AnalyzeScope = "FULL_BOOK" | "CHAPTER_RANGE" | "CHAPTER_LIST";

/**
 * 启动解析任务请求体。
 * 全书解析需传 aiModelId + scope；章节范围解析需额外传起止章节号。
 */
export type StartAnalysisBody =
  | { aiModelId: string; scope: "FULL_BOOK" }
  | { aiModelId: string; scope: "CHAPTER_RANGE"; chapterStart: number; chapterEnd: number }
  | { aiModelId: string; scope: "CHAPTER_LIST"; chapterIndices: number[] };

/**
 * 阅读面板章节内容。
 */
export interface ChapterContent {
  title     : string;
  chapterNo : number;
  paragraphs: string[];
}

interface ChapterReadPayload {
  chapterNo   : number;
  chapterTitle: string;
  paragraphs  : { text: string }[];
}

/**
 * 书籍解析状态快照。
 * 对应 GET /api/books/:bookId/status 返回 data 字段。
 */
export interface BookStatusSnapshot {
  status   : string;
  progress : number;
  stage?   : string;
  errorLog?: string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 上传书籍文件并创建书籍记录。
 * 对应接口：POST /api/books（multipart/form-data）。
 */
export async function createBook(formData: FormData): Promise<CreatedBookData> {
  return clientFetch<CreatedBookData>("/api/books", {
    method: "POST",
    body  : formData
  });
}

/**
 * 拉取指定书籍的章节识别预览列表。
 * 对应接口：GET /api/books/:bookId/chapters/preview。
 */
export async function fetchChapterPreview(bookId: string): Promise<ChapterPreviewItem[]> {
  const data = await clientFetch<{ items: ChapterPreviewItem[] }>(
    `/api/books/${encodeURIComponent(bookId)}/chapters/preview`
  );
  return data.items;
}

/**
 * 确认章节并写入数据库。
 * 对应接口：POST /api/books/:bookId/chapters/confirm。
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
 * 启动 AI 解析任务（后台异步）。
 * 对应接口：POST /api/books/:bookId/analyze。
 */
export async function startAnalysis(bookId: string, body: StartAnalysisBody): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}/analyze`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

/**
 * 拉取一本书的解析状态快照（状态、进度、阶段、错误摘要）。
 * 对应接口：GET /api/books/:bookId/status。
 */
export async function fetchBookStatus(bookId: string): Promise<BookStatusSnapshot> {
  return clientFetch<BookStatusSnapshot>(
    `/api/books/${encodeURIComponent(bookId)}/status`
  );
}

/**
 * 重新触发一本书的全书解析（使用书籍当前绑定模型或系统默认模型）。
 * 对应接口：POST /api/books/:bookId/analyze。
 */
export async function restartAnalysis(bookId: string): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}/analyze`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({})
  });
}

/**
 * 删除一本书。
 * 对应接口：DELETE /api/books/:bookId。
 */
export async function deleteBookById(bookId: string): Promise<void> {
  await clientMutate(`/api/books/${encodeURIComponent(bookId)}`, {
    method: "DELETE"
  });
}

/**
 * 拉取指定章节正文段落。
 * 对应接口：GET /api/books/:bookId/chapters/:chapterId/read。
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
