/**
 * =============================================================================
 * 文件定位（审核中心客户端服务层）
 * -----------------------------------------------------------------------------
 * 文件路径：`src/lib/services/reviews.ts`
 *
 * 本文件属于前端数据访问层，专门封装“审核中心”相关的客户端 HTTP 调用。
 * 在 Next.js 项目中的角色：
 * - 被 `ReviewPanel` 等 Client Component 调用；
 * - 向 `app/api/admin/*` Route Handler 发送请求；
 * - 将后端响应映射为前端可直接渲染的 TypeScript 类型。
 *
 * 业务职责：
 * 1) 拉取待审核草稿（人物/关系/传记事件）；
 * 2) 拉取并处理人物合并建议；
 * 3) 触发批量确认/批量拒绝审核动作。
 *
 * 上游输入：
 * - 页面路由参数（bookId）；
 * - 管理员在 UI 中选择的筛选条件与勾选的草稿 ID。
 *
 * 下游输出：
 * - 结构化草稿数据供审核面板渲染；
 * - 操作接口调用结果（成功返回 void，失败抛错）。
 *
 * 维护注意：
 * - 这里的字段结构与 `/api/admin/*` 响应契约一一对应，不能随意改名；
 * - 所有请求都依赖管理员登录态 Cookie，由服务端鉴权兜底，不在此层重复做权限判断。
 * =============================================================================
 */
import { clientFetch, clientMutate } from "@/lib/client-api";

/* ------------------------------------------------
   Types
   ------------------------------------------------ */

/**
 * 人物草稿列表条目
 * 对应后端 GET /api/admin/drafts 响应中 personas 数组的单个元素。
 * status 取值范围：PENDING / VERIFIED / REJECTED。
 */
export interface PersonaDraftItem {
  /** 草稿记录 ID（来自 Profile 表），用于单选/批量审核操作。 */
  id          : string;
  /** 所属书籍 ID，前端用于按书聚合和路由联动。 */
  bookId      : string;
  /** 所属书籍标题，便于跨书聚合时直接展示。 */
  bookTitle   : string;
  /** 人物实体 ID，编辑人物信息时作为主键传递。 */
  personaId   : string;
  /** 人物主名（展示字段）。 */
  name        : string;
  /** 人物别名列表，空数组表示当前无别名。 */
  aliases     : string[];
  /** 名称类型（如正名/称谓），用于帮助审核员判断抽取质量。 */
  nameType    : string;
  /** 数据来源（AI 或 MANUAL），支持来源筛选。 */
  recordSource: string;
  /** 置信度（0~1），用于辅助人工决策。 */
  confidence  : number;
  /** 籍贯，可空；为空表示原始数据未提取到。 */
  hometown    : string | null;
  /** 审核状态字符串（通常为 PENDING/VERIFIED/REJECTED）。 */
  status      : string;
}

/**
 * 关系草稿列表条目
 * 对应后端 GET /api/admin/drafts 响应中 relationships 数组的单个元素。
 * weight 为关系热度（正整数）；confidence 为原始小数（0–1）。
 */
export interface RelationshipDraftItem {
  /** 关系草稿 ID（审核操作主键）。 */
  id             : string;
  /** 所属书籍 ID。 */
  bookId         : string;
  /** 所属书籍标题。 */
  bookTitle      : string;
  /** 关系首次出现章节 ID。 */
  chapterId      : string;
  /** 章节序号（用于审核员定位原文上下文）。 */
  chapterNo      : number;
  /** 起点人物 ID。 */
  sourcePersonaId: string;
  /** 起点人物名称（展示用）。 */
  sourceName     : string;
  /** 终点人物 ID。 */
  targetPersonaId: string;
  /** 终点人物名称（展示用）。 */
  targetName     : string;
  /** 关系类型（业务标签，如师生/亲属）。 */
  type           : string;
  /** 关系权重（关系强度）。 */
  weight         : number;
  /** AI 抽取置信度（0~1）。 */
  confidence     : number;
  /** 证据文本片段，可空。 */
  evidence       : string | null;
  /** 数据来源（AI / MANUAL）。 */
  recordSource   : string;
  /** 审核状态。 */
  status         : string;
}

/**
 * 传记事件草稿列表条目
 * 对应后端 GET /api/admin/drafts 响应中 biographyRecords 数组的单个元素。
 * category 取值：BIRTH / EXAM / CAREER / TRAVEL / SOCIAL / DEATH / EVENT。
 */
export interface BiographyDraftItem {
  /** 传记事件草稿 ID。 */
  id          : string;
  /** 所属书籍 ID。 */
  bookId      : string;
  /** 所属书籍标题。 */
  bookTitle   : string;
  /** 关联人物 ID。 */
  personaId   : string;
  /** 关联人物名称（用于列表展示）。 */
  personaName : string;
  /** 所属章节 ID。 */
  chapterId   : string;
  /** 所属章节序号。 */
  chapterNo   : number;
  /** 事件类别（如 BIRTH/CAREER 等）。 */
  category    : string;
  /** 事件标题，可空。 */
  title       : string | null;
  /** 事件地点，可空。 */
  location    : string | null;
  /** 事件正文描述。 */
  event       : string;
  /** 数据来源（AI / MANUAL）。 */
  recordSource: string;
  /** 审核状态。 */
  status      : string;
}

/**
 * 合并建议条目
 * 对应后端 GET /api/admin/merge-suggestions 响应数组的单个元素。
 * 表示 AI 识别到的两个可能同一人物的 Persona 合并建议。
 * status 取值：PENDING / ACCEPTED / REJECTED / DEFERRED。
 */
export interface MergeSuggestionItem {
  /** 合并建议 ID。 */
  id             : string;
  /** 所属书籍 ID。 */
  bookId         : string;
  /** 所属书籍标题。 */
  bookTitle      : string;
  /** 建议被合并的一侧人物 ID（source）。 */
  sourcePersonaId: string;
  /** source 人物名。 */
  sourceName     : string;
  /** 建议保留的一侧人物 ID（target）。 */
  targetPersonaId: string;
  /** target 人物名。 */
  targetName     : string;
  /** 建议理由（用于人工判断是否应合并）。 */
  reason         : string;
  /** 建议置信度（0~1）。 */
  confidence     : number;
  /** 建议状态：PENDING/ACCEPTED/REJECTED/DEFERRED。 */
  status         : string;
  /** 建议创建时间（ISO 字符串）。 */
  createdAt      : string;
}

/**
 * 草稿数量汇总
 * fetchDrafts 返回值中的 summary 字段，用于在 Tab 上展示各类草稿数量角标。
 */
export interface DraftsSummary {
  /** 人物草稿数量。 */
  persona     : number;
  /** 关系草稿数量。 */
  relationship: number;
  /** 传记草稿数量。 */
  biography   : number;
  /** 全部草稿总数（用于页头统计）。 */
  total       : number;
}

/**
 * fetchDrafts 完整响应结构
 * 包含 summary 计数和三类草稿列表，由审核面板（review-panel）整体消费。
 */
export interface DraftsData {
  /** 草稿汇总统计。 */
  summary         : DraftsSummary;
  /** 人物草稿列表。 */
  personas        : PersonaDraftItem[];
  /** 关系草稿列表。 */
  relationships   : RelationshipDraftItem[];
  /** 传记事件草稿列表。 */
  biographyRecords: BiographyDraftItem[];
}

export interface ChapterEventChapter {
  id          : string;
  no          : number;
  noText      : string | null;
  title       : string;
  eventCount  : number;
  pendingCount: number;
  isVerified  : boolean;
  verifiedAt  : string | null;
}

export interface ChapterEventChapterData {
  summary: {
    totalChapters   : number;
    verifiedChapters: number;
    pendingEvents   : number;
  };
  chapters: ChapterEventChapter[];
}

export interface ChapterEventItem {
  id          : string;
  personaId   : string;
  personaName : string;
  chapterId   : string;
  chapterNo   : number;
  category    : string;
  title       : string | null;
  location    : string | null;
  event       : string;
  virtualYear : string | null;
  tags        : string[];
  ironyNote   : string | null;
  recordSource: string;
  status      : string;
  updatedAt   : string | null;
}

export interface ChapterEventMutationBody {
  personaId?  : string;
  chapterId?  : string;
  category?   : string;
  title?      : string | null;
  location?   : string | null;
  event?      : string;
  virtualYear?: string | null;
  tags?       : string[];
  ironyNote?  : string | null;
  status?     : string;
}

/* ------------------------------------------------
   Service functions
   ------------------------------------------------ */

/**
 * 获取指定书籍的全量草稿数据（人物 + 关系 + 传记事件）。
 * 对应接口：GET /api/admin/drafts?bookId=:bookId[&source=:source]
 *
 * source 为可选的来源筛选参数（对应 recordSource 字段），不传则返回全部来源。
 * 失败时抛出 Error，message 为可直接展示给用户的文案。
 *
 * @param bookId 书籍 UUID
 * @param source 来源过滤（可选），如 "AI" / "MANUAL"
 * @returns DraftsData 包含 summary + 三类草稿列表
 */
export async function fetchDrafts(
  bookId: string,
  source?: string | null
): Promise<DraftsData> {
  // `bookId` 是审核上下文的主键，没有它就无法限定审核范围。
  const params = new URLSearchParams({ bookId });
  // 仅在用户选择来源筛选时附加 query，避免把空值传给后端造成语义歧义。
  if (source) params.set("source", source);
  return clientFetch<DraftsData>(`/api/admin/drafts?${params}`);
}

export async function fetchChapterEventChapters(bookId: string): Promise<ChapterEventChapterData> {
  return clientFetch<ChapterEventChapterData>(`/api/admin/review/books/${bookId}/chapter-events`);
}

export async function fetchChapterEvents(
  bookId: string,
  chapterId: string,
  filters: { status?: string | null; source?: string | null } = {}
): Promise<ChapterEventItem[]> {
  const params = new URLSearchParams({ chapterId });
  if (filters.status) params.set("status", filters.status);
  if (filters.source) params.set("source", filters.source);
  return clientFetch<ChapterEventItem[]>(`/api/admin/review/books/${bookId}/chapter-events?${params}`);
}

export async function createChapterEvent(
  bookId: string,
  body: Required<Pick<ChapterEventMutationBody, "personaId" | "chapterId" | "event">> & ChapterEventMutationBody
): Promise<ChapterEventItem> {
  return clientFetch<ChapterEventItem>(`/api/admin/review/books/${bookId}/chapter-events`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function updateChapterEvent(
  bookId: string,
  eventId: string,
  body: ChapterEventMutationBody
): Promise<ChapterEventItem> {
  return clientFetch<ChapterEventItem>(`/api/admin/review/books/${bookId}/chapter-events/${eventId}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(body)
  });
}

export async function deleteChapterEvent(bookId: string, eventId: string): Promise<void> {
  await clientMutate(`/api/admin/review/books/${bookId}/chapter-events/${eventId}`, {
    method: "DELETE"
  });
}

export async function markChapterEventsVerified(bookId: string, chapterId: string): Promise<void> {
  await clientMutate(`/api/admin/review/books/${bookId}/chapter-events/verify`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ chapterId })
  });
}

/**
 * 获取指定书籍的合并建议列表。
 * 对应接口：GET /api/admin/merge-suggestions?bookId=:bookId
 *
 * 返回 AI 生成的所有待处理（及历史）合并建议，状态为 PENDING 的显示在审核面板中。
 * 失败时抛出 Error。
 *
 * @param bookId 书籍 UUID
 * @returns MergeSuggestionItem[]
 */
export async function fetchMergeSuggestions(bookId: string): Promise<MergeSuggestionItem[]> {
  // 当前接口以 query 传 bookId，保持与 drafts 接口同类查询语义。
  return clientFetch<MergeSuggestionItem[]>(`/api/admin/merge-suggestions?bookId=${bookId}`);
}

/**
 * 接受合并建议：执行后端人物合并逻辑，将 sourcePersona 合并入 targetPersona。
 * 对应接口：POST /api/admin/merge-suggestions/:id/accept
 *
 * @param id 合并建议 UUID
 */
export async function acceptMergeSuggestion(id: string): Promise<void> {
  // accept 会触发服务端真实合并流程，属于有副作用写操作，因此使用 mutate。
  await clientMutate(`/api/admin/merge-suggestions/${id}/accept`, { method: "POST" });
}

/**
 * 拒绝合并建议：标记两个人物不应合并，状态更新为 REJECTED。
 * 对应接口：POST /api/admin/merge-suggestions/:id/reject
 *
 * @param id 合并建议 UUID
 */
export async function rejectMergeSuggestion(id: string): Promise<void> {
  await clientMutate(`/api/admin/merge-suggestions/${id}/reject`, { method: "POST" });
}

/**
 * 推迟合并建议：暂不处理，状态更新为 DEFERRED，保留后续再审。
 * 对应接口：POST /api/admin/merge-suggestions/:id/defer
 *
 * @param id 合并建议 UUID
 */
export async function deferMergeSuggestion(id: string): Promise<void> {
  await clientMutate(`/api/admin/merge-suggestions/${id}/defer`, { method: "POST" });
}

/**
 * 批量通过草稿：将多条草稿状态更新为 VERIFIED。
 * 对应接口：POST /api/admin/bulk-verify
 *
 * @param ids 草稿 UUID 数组（可混合三类草稿 ID）
 */
export async function bulkVerifyDrafts(ids: string[]): Promise<void> {
  // 批量接口用 JSON body 传输数组，避免 query 过长与编码复杂度。
  await clientMutate("/api/admin/bulk-verify", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ids })
  });
}

/**
 * 批量拒绝草稿：将多条草稿状态更新为 REJECTED。
 * 对应接口：POST /api/admin/bulk-reject
 *
 * @param ids 草稿 UUID 数组（可混合三类草稿 ID）
 */
export async function bulkRejectDrafts(ids: string[]): Promise<void> {
  await clientMutate("/api/admin/bulk-reject", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ids })
  });
}
