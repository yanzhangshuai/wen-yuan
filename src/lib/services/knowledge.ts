/**
 * 前端知识包 + 条目服务层。
 * 对接 `/api/admin/knowledge/alias-packs` 和 `/api/admin/knowledge/alias-entries` 路由族。
 */
import { clientFetch, clientMutate } from "@/lib/client-api";
import { fetchModels, type AdminModelItem } from "@/lib/services/models";
import type { BookLibraryListItem } from "@/types/book";

/* ========== 知识包 ========== */

export interface KnowledgePackItem {
  id          : string;
  bookTypeId  : string | null;
  name        : string;
  description : string | null;
  version     : number;
  isActive    : boolean;
  scope       : string;
  createdAt   : string;
  updatedAt   : string;
  bookType    : { id: string; key: string; name: string } | null;
  _count      : { entries: number; bookPacks: number };
  statusCounts: Record<string, number>;
}

export interface KnowledgePackDetail extends KnowledgePackItem {
  statusCounts: Record<string, number>;
}

export interface AliasPackGenerationPreview {
  packId     : string;
  packName   : string;
  genreKey   : string | null;
  targetCount: number;
  bookContext: {
    id    : string;
    title : string;
    author: string | null;
  } | null;
  systemPrompt: string;
  userPrompt  : string;
}

export interface AliasPackGenerationResult extends AliasPackGenerationPreview {
  created   : number;
  skipped   : number;
  rawContent: string;
  model: {
    id       : string;
    provider : string;
    modelName: string;
  };
}

export interface AliasPackGeneratedCandidate {
  canonicalName    : string;
  aliases          : string[];
  confidence       : number;
  overlapEntries   : string[];
  overlapTerms     : string[];
  defaultSelected  : boolean;
  recommendedAction: "SELECT" | "REJECT";
  rejectionReason? : string;
}

export interface AliasPackGenerationReviewResult extends AliasPackGenerationPreview {
  candidates     : AliasPackGeneratedCandidate[];
  skipped        : number;
  skippedExisting: number;
  rawContent     : string;
  model: {
    id       : string;
    provider : string;
    modelName: string;
  };
}

export interface KnowledgeGenerationBookOption {
  id    : string;
  title : string;
  author: string | null;
}

export interface KnowledgeGenerationModelOption {
  id             : string;
  name           : string;
  provider       : string;
  providerModelId: string;
  isDefault      : boolean;
}

export async function fetchGenerationBooks(): Promise<KnowledgeGenerationBookOption[]> {
  const books = await clientFetch<BookLibraryListItem[]>("/api/books", {
    cache: "no-store"
  });

  return books.map((book) => ({
    id    : book.id,
    title : book.title,
    author: book.author
  }));
}

export async function fetchGenerationModels(): Promise<KnowledgeGenerationModelOption[]> {
  const models = await fetchModels();

  // 只过滤 isEnabled，不再要求 isConfigured。
  // 原因：isConfigured 依赖 API Key 解密是否成功，在某些部署环境（环境变量未注入）下
  // 会把有效模型误判为未配置，导致弹框模型列表为空、无法生成。
  // isEnabled 是管理员显式启用的标志，足以作为"可选择"判据；
  // 实际调用失败时后端会返回可读错误，比前端静默隐藏模型更利于排障。
  return models
    .filter((model) => model.isEnabled)
    .map((model: AdminModelItem) => ({
      id             : model.id,
      name           : model.name,
      provider       : model.provider,
      providerModelId: model.providerModelId,
      isDefault      : model.isDefault
    }));
}

export async function fetchKnowledgePacks(params?: {
  bookTypeId?: string;
  scope?     : string;
}): Promise<KnowledgePackItem[]> {
  const sp = new URLSearchParams();
  if (params?.bookTypeId) sp.set("bookTypeId", params.bookTypeId);
  if (params?.scope) sp.set("scope", params.scope);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<KnowledgePackItem[]>(`/api/admin/knowledge/alias-packs${qs}`);
}

export async function fetchKnowledgePack(id: string): Promise<KnowledgePackDetail> {
  return clientFetch<KnowledgePackDetail>(`/api/admin/knowledge/alias-packs/${id}`);
}

export async function createKnowledgePack(data: {
  bookTypeId? : string;
  name        : string;
  scope       : string;
  description?: string;
}): Promise<KnowledgePackItem> {
  return clientFetch<KnowledgePackItem>("/api/admin/knowledge/alias-packs", {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateKnowledgePack(id: string, data: Partial<{
  name: string; description: string | null; isActive: boolean;
}>): Promise<void> {
  await clientMutate(`/api/admin/knowledge/alias-packs/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteKnowledgePack(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/alias-packs/${id}`, { method: "DELETE" });
}

export async function previewGenerateEntriesPrompt(packId: string, params?: {
  targetCount?           : number;
  additionalInstructions?: string;
  bookId?                : string;
}): Promise<AliasPackGenerationPreview> {
  const sp = new URLSearchParams();
  if (params?.targetCount) sp.set("targetCount", String(params.targetCount));
  if (params?.additionalInstructions) sp.set("additionalInstructions", params.additionalInstructions);
  if (params?.bookId) sp.set("bookId", params.bookId);
  const qs = sp.toString() ? `?${sp.toString()}` : "";
  return clientFetch<AliasPackGenerationPreview>(`/api/admin/knowledge/alias-packs/${packId}/generate/preview-prompt${qs}`);
}

export interface AliasPackGenerationJobStatus {
  jobId : string;
  status: "pending" | "running" | "done" | "error";
  step  : string;
  result: AliasPackGenerationReviewResult | AliasPackGenerationResult | null;
  error : string | null;
}

export async function generateEntries(packId: string, data?: {
  targetCount?           : number;
  additionalInstructions?: string;
  modelId?               : string;
  bookId?                : string;
}): Promise<{ jobId: string }> {
  return clientFetch<{ jobId: string }>(`/api/admin/knowledge/alias-packs/${packId}/generate`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data ?? {})
  });
}

export async function reviewGenerateEntries(packId: string, data?: {
  targetCount?           : number;
  additionalInstructions?: string;
  modelId?               : string;
  bookId?                : string;
}): Promise<{ jobId: string }> {
  return clientFetch<{ jobId: string }>(`/api/admin/knowledge/alias-packs/${packId}/generate`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ...(data ?? {}), dryRun: true })
  });
}

export async function pollAliasPackGenerationJob(packId: string, jobId: string): Promise<AliasPackGenerationJobStatus> {
  return clientFetch<AliasPackGenerationJobStatus>(
    `/api/admin/knowledge/alias-packs/${packId}/generate?jobId=${encodeURIComponent(jobId)}`
  );
}

/* ========== 知识条目 ========== */

export interface KnowledgeEntryItem {
  id             : string;
  packId         : string;
  canonicalName  : string;
  aliases        : string[];
  entryType      : string;
  confidence     : number;
  source         : string;
  sourceDetail   : string | null;
  reviewStatus   : string;
  reviewNote     : string | null;
  reviewedAt     : string | null;
  notes          : string | null;
  createdAt      : string;
  updatedAt      : string;
  overlapEntries?: string[];
  overlapTerms?  : string[];
}

export interface EntriesPage {
  entries : KnowledgeEntryItem[];
  total   : number;
  page    : number;
  pageSize: number;
}

export async function fetchEntries(packId: string, params?: {
  reviewStatus?: string; q?: string; page?: number; pageSize?: number;
}): Promise<EntriesPage> {
  const sp = new URLSearchParams();
  if (params?.reviewStatus) sp.set("reviewStatus", params.reviewStatus);
  if (params?.q) sp.set("q", params.q);
  if (params?.page) sp.set("page", String(params.page));
  if (params?.pageSize) sp.set("page_size", String(params.pageSize));
  const qs = sp.toString() ? `?${sp.toString()}` : "";

  // API 返回 entries 在 data 字段，分页在 meta.pagination 中
  // clientFetch 只提取 data，分页信息需要从完整响应中获取
  const res = await fetch(`/api/admin/knowledge/alias-packs/${packId}/entries${qs}`);
  const payload = await res.json() as {
    success: boolean;
    data   : KnowledgeEntryItem[];
    meta   : { pagination?: { page: number; pageSize: number; total: number } };
  };

  if (!payload.success) throw new Error("获取条目失败");

  return {
    entries : payload.data,
    total   : payload.meta.pagination?.total ?? 0,
    page    : payload.meta.pagination?.page ?? 1,
    pageSize: payload.meta.pagination?.pageSize ?? 50
  };
}

export async function createEntry(packId: string, data: {
  canonicalName: string; aliases: string[]; entryType?: string; notes?: string;
}): Promise<KnowledgeEntryItem> {
  return clientFetch<KnowledgeEntryItem>(`/api/admin/knowledge/alias-packs/${packId}/entries`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function updateEntry(id: string, data: Partial<{
  canonicalName: string; aliases: string[]; entryType: string; notes: string | null; confidence: number;
}>): Promise<void> {
  await clientMutate(`/api/admin/knowledge/alias-entries/${id}`, {
    method : "PATCH",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export async function deleteEntry(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/alias-entries/${id}`, { method: "DELETE" });
}

export async function verifyEntry(id: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/alias-entries/${id}/verify`, { method: "POST" });
}

export async function rejectEntry(id: string, note?: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/alias-entries/${id}/reject`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ note })
  });
}

export async function batchVerifyEntries(packId: string, ids: string[]): Promise<{ count: number }> {
  return clientFetch<{ count: number }>(`/api/admin/knowledge/alias-packs/${packId}/entries/batch-verify`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ids })
  });
}

export async function batchRejectEntries(packId: string, ids: string[], note?: string): Promise<{ count: number }> {
  return clientFetch<{ count: number }>(`/api/admin/knowledge/alias-packs/${packId}/entries/batch-reject`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ ids, note })
  });
}

export async function importEntries(packId: string, data: {
  entries      : Array<{ canonicalName: string; aliases: string[]; entryType?: string; notes?: string; confidence?: number }>;
  reviewStatus?: string;
  source?      : "IMPORTED" | "LLM_GENERATED";
  sourceDetail?: string;
  auditAction? : "IMPORT" | "GENERATE";
}): Promise<{ count: number }> {
  return clientFetch<{ count: number }>(`/api/admin/knowledge/alias-packs/${packId}/import`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify(data)
  });
}

export function getExportUrl(
  packId: string,
  format: "json" | "csv" = "json",
  reviewStatus: "verified" | "all" = "verified"
): string {
  return `/api/admin/knowledge/alias-packs/${packId}/export?format=${format}&reviewStatus=${reviewStatus}`;
}

/**
 * 将知识包挂载到指定书籍。
 * 对接 `POST /api/admin/knowledge/books/:bookId/knowledge-packs`。
 */
export async function mountPackToBook(bookId: string, packId: string, priority = 0): Promise<void> {
  await clientMutate(`/api/admin/knowledge/books/${bookId}/knowledge-packs`, {
    method : "POST",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ packId, priority })
  });
}

/**
 * 从指定书籍卸载知识包。
 * 对接 `DELETE /api/admin/knowledge/books/:bookId/knowledge-packs`。
 */
export async function unmountPackFromBook(bookId: string, packId: string): Promise<void> {
  await clientMutate(`/api/admin/knowledge/books/${bookId}/knowledge-packs`, {
    method : "DELETE",
    headers: { "Content-Type": "application/json" },
    body   : JSON.stringify({ packId })
  });
}
