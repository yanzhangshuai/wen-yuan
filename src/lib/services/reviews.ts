/**
 * @module reviews
 * @description 审核（Review）流程客户端服务层
 *
 * 封装管理员审核所需的所有 HTTP 请求，对应后端路由 `/api/admin/*`。
 *
 * 包含内容：
 * - PersonaDraftItem / RelationshipDraftItem / BiographyDraftItem：草稿列表条目类型
 * - MergeSuggestionItem：合并建议条目类型
 * - DraftsSummary / DraftsData：草稿聚合视图
 * - fetchDrafts：按书籍+来源拉取全量草稿
 * - fetchMergeSuggestions：拉取合并建议列表
 * - acceptMergeSuggestion / rejectMergeSuggestion / deferMergeSuggestion：单条建议操作
 * - bulkVerifyDrafts / bulkRejectDrafts：批量审核操作
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
  id          : string;
  bookId      : string;
  bookTitle   : string;
  personaId   : string;
  name        : string;
  aliases     : string[];
  nameType    : string;
  recordSource: string;
  confidence  : number;
  hometown    : string | null;
  status      : string;
}

/**
 * 关系草稿列表条目
 * 对应后端 GET /api/admin/drafts 响应中 relationships 数组的单个元素。
 * weight 为关系热度（正整数）；confidence 为原始小数（0–1）。
 */
export interface RelationshipDraftItem {
  id             : string;
  bookId         : string;
  bookTitle      : string;
  chapterId      : string;
  chapterNo      : number;
  sourcePersonaId: string;
  sourceName     : string;
  targetPersonaId: string;
  targetName     : string;
  type           : string;
  weight         : number;
  confidence     : number;
  evidence       : string | null;
  recordSource   : string;
  status         : string;
}

/**
 * 传记事件草稿列表条目
 * 对应后端 GET /api/admin/drafts 响应中 biographyRecords 数组的单个元素。
 * category 取值：BIRTH / EXAM / CAREER / TRAVEL / SOCIAL / DEATH / EVENT。
 */
export interface BiographyDraftItem {
  id          : string;
  bookId      : string;
  bookTitle   : string;
  personaId   : string;
  personaName : string;
  chapterId   : string;
  chapterNo   : number;
  category    : string;
  title       : string | null;
  location    : string | null;
  event       : string;
  recordSource: string;
  status      : string;
}

/**
 * 合并建议条目
 * 对应后端 GET /api/admin/merge-suggestions 响应数组的单个元素。
 * 表示 AI 识别到的两个可能同一人物的 Persona 合并建议。
 * status 取值：PENDING / ACCEPTED / REJECTED / DEFERRED。
 */
export interface MergeSuggestionItem {
  id             : string;
  bookId         : string;
  bookTitle      : string;
  sourcePersonaId: string;
  sourceName     : string;
  targetPersonaId: string;
  targetName     : string;
  reason         : string;
  confidence     : number;
  status         : string;
  createdAt      : string;
}

/**
 * 草稿数量汇总
 * fetchDrafts 返回值中的 summary 字段，用于在 Tab 上展示各类草稿数量角标。
 */
export interface DraftsSummary {
  persona     : number;
  relationship: number;
  biography   : number;
  total       : number;
}

/**
 * fetchDrafts 完整响应结构
 * 包含 summary 计数和三类草稿列表，由审核面板（review-panel）整体消费。
 */
export interface DraftsData {
  summary         : DraftsSummary;
  personas        : PersonaDraftItem[];
  relationships   : RelationshipDraftItem[];
  biographyRecords: BiographyDraftItem[];
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
  const params = new URLSearchParams({ bookId });
  if (source) params.set("source", source);
  return clientFetch<DraftsData>(`/api/admin/drafts?${params}`);
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
  return clientFetch<MergeSuggestionItem[]>(`/api/admin/merge-suggestions?bookId=${bookId}`);
}

/**
 * 接受合并建议：执行后端人物合并逻辑，将 sourcePersona 合并入 targetPersona。
 * 对应接口：POST /api/admin/merge-suggestions/:id/accept
 *
 * @param id 合并建议 UUID
 */
export async function acceptMergeSuggestion(id: string): Promise<void> {
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
