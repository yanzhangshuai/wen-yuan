"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import {
  Check,
  X as XIcon,
  Edit3,
  Filter,
  Users,
  Link2,
  Calendar,
  GitMerge,
  Loader2,
  Tags,
  ShieldCheck
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PersonaEditForm } from "@/components/review/persona-edit-form";
import { RelationshipEditForm } from "@/components/review/relationship-edit-form";
import { BiographyEditForm } from "@/components/review/biography-edit-form";
import { EntityMergeTool } from "@/components/review/entity-merge-tool";
import { AliasReviewTab } from "@/components/review/alias-review-tab";
import { ValidationReportTab } from "@/components/review/validation-report-tab";
import type { PersonaSummary } from "@/lib/services/personas";
import { fetchPersonaSummary } from "@/lib/services/personas";
import {
  fetchDrafts as apiFetchDrafts,
  fetchMergeSuggestions as apiFetchMergeSuggestions,
  acceptMergeSuggestion,
  rejectMergeSuggestion,
  deferMergeSuggestion,
  bulkVerifyDrafts,
  bulkRejectDrafts,
  type MergeSuggestionItem,
  type DraftsData
} from "@/lib/services/reviews";
import {
  fetchAliasMappings as apiFetchAliasMappings,
  type AliasMappingItem
} from "@/lib/services/alias-mappings";
import {
  fetchValidationReports as apiFetchValidationReports,
  type ValidationReportItem
} from "@/lib/services/validation-reports";

/* ------------------------------------------------
   Props
   ------------------------------------------------ */
export interface ReviewPanelProps {
  bookId                   : string;
  bookTitle                : string;
  initialDrafts            : DraftsData;
  initialMergeSuggestions  : MergeSuggestionItem[];
  initialAliasMappings?    : AliasMappingItem[];
  initialValidationReports?: ValidationReportItem[];
}

/* ------------------------------------------------
   Tab types
   ------------------------------------------------ */
type ReviewTab = "personas" | "relationships" | "biography" | "merge" | "aliases" | "validation";

const TAB_CONFIG: { id: ReviewTab; label: string; icon: ReactNode }[] = [
  { id: "personas", label: "人物草稿", icon: <Users size={14} /> },
  { id: "relationships", label: "关系草稿", icon: <Link2 size={14} /> },
  { id: "biography", label: "传记事件", icon: <Calendar size={14} /> },
  { id: "merge", label: "合并建议", icon: <GitMerge size={14} /> },
  { id: "aliases", label: "别名映射", icon: <Tags size={14} /> },
  { id: "validation", label: "自检报告", icon: <ShieldCheck size={14} /> }
];

const BIO_CATEGORY_LABELS: Record<string, string> = {
  BIRTH : "出生",
  EXAM  : "科举",
  CAREER: "仕途",
  TRAVEL: "行旅",
  SOCIAL: "社交",
  DEATH : "逝世",
  EVENT : "事件"
};

/* ------------------------------------------------
   Component
   ------------------------------------------------ */
export function ReviewPanel({
  bookId,
  bookTitle,
  initialDrafts,
  initialMergeSuggestions,
  initialAliasMappings,
  initialValidationReports
}: ReviewPanelProps) {
  const [activeTab, setActiveTab] = useState<ReviewTab>("personas");
  const [sourceFilter, setSourceFilter] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<DraftsData | null>(initialDrafts);
  const [mergeSuggestions, setMergeSuggestions] = useState<MergeSuggestionItem[]>(initialMergeSuggestions);
  const [aliasMappings, setAliasMappings] = useState<AliasMappingItem[]>(initialAliasMappings ?? []);
  const [validationReports, setValidationReports] = useState<ValidationReportItem[]>(initialValidationReports ?? []);
  const [loading, setLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingType, setEditingType] = useState<"persona" | "relationship" | "biography" | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mergePreview, setMergePreview] = useState<{
    suggestionId : string;
    sourcePromise: Promise<PersonaSummary | null>;
    targetPromise: Promise<PersonaSummary | null>;
  } | null>(null);

  useEffect(() => {
    /* 模块切换时重置本地状态，避免旧书籍的筛选/选中态遗留到新 bookId。 */
    setDrafts(initialDrafts);
    setMergeSuggestions(initialMergeSuggestions);
    setAliasMappings(initialAliasMappings ?? []);
    setValidationReports(initialValidationReports ?? []);
    setActiveTab("personas");
    setSourceFilter(null);
    setSelectedIds(new Set());
    setBulkLoading(false);
    setLoading(false);
    setLoadError(null);
    setEditingId(null);
    setEditingType(null);
    setMergePreview(null);
  }, [bookId, initialDrafts, initialMergeSuggestions, initialAliasMappings, initialValidationReports]);

  /* 未通过 SSR 预载别名/自检数据时，客户端首次挂载懒加载。 */
  useEffect(() => {
    if (!initialAliasMappings) {
      void apiFetchAliasMappings(bookId).then(setAliasMappings).catch(() => { /* silent */ });
    }
    if (!initialValidationReports) {
      void apiFetchValidationReports(bookId).then(setValidationReports).catch(() => { /* silent */ });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bookId]);

  function startEdit(id: string, type: "persona" | "relationship" | "biography") {
    setEditingId(id);
    setEditingType(type);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingType(null);
  }

  function handleEditSaved() {
    cancelEdit();
    void fetchDrafts(sourceFilter);
  }

  // Fetch drafts
  const fetchDrafts = useCallback(async (nextSourceFilter: string | null) => {
    setLoading(true);
    setLoadError(null);
    try {
      const data = await apiFetchDrafts(bookId, nextSourceFilter);
      setDrafts(data);
    } catch {
      setLoadError("刷新审核列表失败，请稍后重试。");
    } finally {
      setLoading(false);
    }
  }, [bookId]);

  // Fetch merge suggestions
  const fetchMerge = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetchMergeSuggestions(bookId);
      setMergeSuggestions(data);
    } catch {
      setLoadError("刷新合并建议失败，请稍后重试。");
    }
  }, [bookId]);

  // Fetch alias mappings
  const fetchAliases = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetchAliasMappings(bookId);
      setAliasMappings(data);
    } catch {
      setLoadError("刷新别名映射失败，请稍后重试。");
    }
  }, [bookId]);

  // Fetch validation reports
  const fetchValidation = useCallback(async () => {
    setLoadError(null);
    try {
      const data = await apiFetchValidationReports(bookId);
      setValidationReports(data);
    } catch {
      setLoadError("刷新自检报告失败，请稍后重试。");
    }
  }, [bookId]);

  // Bulk verify
  async function handleBulkVerify() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await bulkVerifyDrafts([...selectedIds]);
      setSelectedIds(new Set());
      void fetchDrafts(sourceFilter);
    } finally {
      setBulkLoading(false);
    }
  }

  // Bulk reject
  async function handleBulkReject() {
    if (selectedIds.size === 0) return;
    setBulkLoading(true);
    try {
      await bulkRejectDrafts([...selectedIds]);
      setSelectedIds(new Set());
      void fetchDrafts(sourceFilter);
    } finally {
      setBulkLoading(false);
    }
  }

  // Merge suggestion actions
  async function handleMergeAction(id: string, action: "accept" | "reject" | "defer") {
    try {
      if (action === "accept") await acceptMergeSuggestion(id);
      else if (action === "reject") await rejectMergeSuggestion(id);
      else await deferMergeSuggestion(id);
      void fetchMerge();
    } catch {
      setLoadError("处理合并建议失败，请重试。");
    }
  }

  // Selection helpers
  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectAll(ids: string[]) {
    const allSelected = ids.every(id => selectedIds.has(id));
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(ids));
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground">{bookTitle}</h2>
          {drafts && (
            <p className="text-sm text-muted-foreground">
              共 {drafts.summary.total} 条待审核
              （人物 {drafts.summary.persona} · 关系 {drafts.summary.relationship} · 传记 {drafts.summary.biography}）
            </p>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Source filter */}
          <div className="flex items-center gap-1 rounded-md border border-border px-2 py-1">
            <Filter size={14} className="text-muted-foreground" />
            <select
              value={sourceFilter ?? ""}
              onChange={e => {
                const nextFilter = e.target.value || null;
                setSourceFilter(nextFilter);
                void fetchDrafts(nextFilter);
              }}
              className="bg-transparent text-xs text-foreground outline-none"
              aria-label="来源筛选"
            >
              <option value="">全部来源</option>
              <option value="AI">AI 生成</option>
              <option value="MANUAL">手动录入</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg border border-border bg-muted p-1">
        {TAB_CONFIG.map(tab => (
          <button
            key={tab.id}
            type="button"
            onClick={() => { setActiveTab(tab.id); setSelectedIds(new Set()); }}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm transition-colors ${
              activeTab === tab.id
                ? "bg-card font-medium text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.icon}
            {tab.label}
            <span className="ml-1 rounded-full bg-primary-subtle px-1.5 py-0.5 text-xs">
              {tab.id === "personas"
                ? (drafts?.summary.persona ?? 0)
                : tab.id === "relationships"
                  ? (drafts?.summary.relationship ?? 0)
                  : tab.id === "biography"
                    ? (drafts?.summary.biography ?? 0)
                    : tab.id === "merge"
                      ? mergeSuggestions.length
                      : tab.id === "aliases"
                        ? aliasMappings.filter(m => m.status === "PENDING").length
                        : validationReports.reduce((sum, r) => sum + r.summary.needsReview, 0)}
            </span>
          </button>
        ))}
      </div>

      {/* Bulk actions bar */}
      {selectedIds.size > 0 && (
        <div className="flex items-center gap-2 rounded-md bg-primary-subtle px-3 py-2">
          <span className="text-sm text-foreground">
            已选 {selectedIds.size} 项
          </span>
          <Button size="sm" onClick={() => { void handleBulkVerify(); }} disabled={bulkLoading}>
            {bulkLoading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            <span className="ml-1">批量确认</span>
          </Button>
          <Button size="sm" variant="destructive" onClick={() => { void handleBulkReject(); }} disabled={bulkLoading}>
            <XIcon size={14} />
            <span className="ml-1">批量拒绝</span>
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {loadError}
        </div>
      )}

      {/* Persona drafts tab */}
      {!loading && activeTab === "personas" && drafts && (
        <div className="flex flex-col gap-2">
          {drafts.personas.length === 0 && (
            <EmptyState text="暂无人物草稿" />
          )}
          {drafts.personas.length > 0 && (
            <div className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={drafts.personas.every(p => selectedIds.has(p.id))}
                onChange={() => selectAll(drafts.personas.map(p => p.id))}
                className="accent-primary"
                aria-label="全选"
              />
              <span className="text-xs text-muted-foreground">全选</span>
            </div>
          )}
          {drafts.personas.map(persona => (
            editingId === persona.personaId && editingType === "persona" ? (
              <PersonaEditForm
                key={persona.id}
                personaId={persona.personaId}
                initialData={{
                  name      : persona.name,
                  aliases   : persona.aliases,
                  hometown  : persona.hometown,
                  confidence: persona.confidence
                }}
                onSaved={handleEditSaved}
                onCancel={cancelEdit}
              />
            ) : (
            <div
              key={persona.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3 transition-colors hover:border-primary-subtle"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(persona.id)}
                onChange={() => toggleSelect(persona.id)}
                className="mt-1 accent-primary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{persona.name}</span>
                  <Badge variant="outline" className="text-xs">{persona.nameType}</Badge>
                  <Badge variant="outline" className="text-xs">
                    {persona.recordSource === "AI" ? "AI" : "手动"}
                  </Badge>
                  <span className="text-xs text-muted-foreground">
                    置信度 {(persona.confidence * 100).toFixed(0)}%
                  </span>
                </div>
                {persona.aliases.length > 0 && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    别名：{persona.aliases.join("、")}
                  </p>
                )}
                {persona.hometown && (
                  <p className="text-xs text-muted-foreground">
                    籍贯：{persona.hometown}
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => { void handleBulkAction([persona.id], "verify"); }}
                  className="rounded p-1.5 text-success hover:bg-success/10"
                  aria-label="确认"
                  title="确认"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleBulkAction([persona.id], "reject"); }}
                  className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label="拒绝"
                  title="拒绝"
                >
                  <XIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(persona.personaId, "persona")}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="编辑"
                  title="编辑"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            </div>
            )
          ))}
        </div>
      )}

      {/* Relationship drafts tab */}
      {!loading && activeTab === "relationships" && drafts && (
        <div className="flex flex-col gap-2">
          {drafts.relationships.length === 0 && (
            <EmptyState text="暂无关系草稿" />
          )}
          {drafts.relationships.length > 0 && (
            <div className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={drafts.relationships.every(r => selectedIds.has(r.id))}
                onChange={() => selectAll(drafts.relationships.map(r => r.id))}
                className="accent-primary"
                aria-label="全选"
              />
              <span className="text-xs text-muted-foreground">全选</span>
            </div>
          )}
          {drafts.relationships.map(rel => (
            editingId === rel.id && editingType === "relationship" ? (
              <RelationshipEditForm
                key={rel.id}
                relationshipId={rel.id}
                initialData={{
                  type      : rel.type,
                  weight    : rel.weight,
                  evidence  : rel.evidence,
                  confidence: rel.confidence
                }}
                onSaved={handleEditSaved}
                onCancel={cancelEdit}
              />
            ) : (
            <div
              key={rel.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(rel.id)}
                onChange={() => toggleSelect(rel.id)}
                className="mt-1 accent-primary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium text-foreground">{rel.sourceName}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className="font-medium text-foreground">{rel.targetName}</span>
                  <Badge variant="outline" className="text-xs">{rel.type}</Badge>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                  <span>第{rel.chapterNo}回</span>
                  <span>权重 {rel.weight}</span>
                  <span>置信度 {(rel.confidence * 100).toFixed(0)}%</span>
                </div>
                {rel.evidence && (
                  <p className="mt-1 text-xs italic text-muted-foreground">
                    &ldquo;{rel.evidence.slice(0, 100)}{rel.evidence.length > 100 ? "…" : ""}&rdquo;
                  </p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => { void handleBulkAction([rel.id], "verify"); }}
                  className="rounded p-1.5 text-success hover:bg-success/10"
                  aria-label="确认"
                  title="确认"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleBulkAction([rel.id], "reject"); }}
                  className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label="拒绝"
                  title="拒绝"
                >
                  <XIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(rel.id, "relationship")}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="编辑"
                  title="编辑"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            </div>
            )
          ))}
        </div>
      )}

      {/* Biography drafts tab */}
      {!loading && activeTab === "biography" && drafts && (
        <div className="flex flex-col gap-2">
          {drafts.biographyRecords.length === 0 && (
            <EmptyState text="暂无传记事件草稿" />
          )}
          {drafts.biographyRecords.length > 0 && (
            <div className="mb-1 flex items-center gap-2">
              <input
                type="checkbox"
                checked={drafts.biographyRecords.every(b => selectedIds.has(b.id))}
                onChange={() => selectAll(drafts.biographyRecords.map(b => b.id))}
                className="accent-primary"
                aria-label="全选"
              />
              <span className="text-xs text-muted-foreground">全选</span>
            </div>
          )}
          {drafts.biographyRecords.map(bio => (
            editingId === bio.id && editingType === "biography" ? (
              <BiographyEditForm
                key={bio.id}
                biographyId={bio.id}
                initialData={{
                  category: bio.category,
                  title   : bio.title,
                  location: bio.location,
                  event   : bio.event
                }}
                onSaved={handleEditSaved}
                onCancel={cancelEdit}
              />
            ) : (
            <div
              key={bio.id}
              className="flex items-start gap-3 rounded-lg border border-border bg-card p-3"
            >
              <input
                type="checkbox"
                checked={selectedIds.has(bio.id)}
                onChange={() => toggleSelect(bio.id)}
                className="mt-1 accent-primary"
              />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-foreground">{bio.personaName}</span>
                  <Badge variant="outline" className="text-xs">
                    {BIO_CATEGORY_LABELS[bio.category] ?? bio.category}
                  </Badge>
                  <span className="text-xs text-muted-foreground">第{bio.chapterNo}回</span>
                </div>
                {bio.title && (
                  <p className="mt-0.5 text-sm text-foreground">{bio.title}</p>
                )}
                <p className="mt-0.5 text-xs text-muted-foreground">{bio.event}</p>
                {bio.location && (
                  <p className="text-xs text-muted-foreground">地点：{bio.location}</p>
                )}
              </div>
              <div className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => { void handleBulkAction([bio.id], "verify"); }}
                  className="rounded p-1.5 text-success hover:bg-success/10"
                  aria-label="确认"
                  title="确认"
                >
                  <Check size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => { void handleBulkAction([bio.id], "reject"); }}
                  className="rounded p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label="拒绝"
                  title="拒绝"
                >
                  <XIcon size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => startEdit(bio.id, "biography")}
                  className="rounded p-1.5 text-muted-foreground hover:bg-muted"
                  aria-label="编辑"
                  title="编辑"
                >
                  <Edit3 size={16} />
                </button>
              </div>
            </div>
            )
          ))}
        </div>
      )}

      {/* Merge suggestions tab */}
      {!loading && activeTab === "merge" && (
        <div className="flex flex-col gap-2">
          {mergeSuggestions.length === 0 && (
            <EmptyState text="暂无合并建议" />
          )}
          {mergeSuggestions.map(sug => (
            mergePreview?.suggestionId === sug.id ? (
              <EntityMergeTool
                key={sug.id}
                sourcePromise={mergePreview.sourcePromise}
                targetPromise={mergePreview.targetPromise}
                suggestionId={sug.id}
                onDone={() => {
                  setMergePreview(null);
                  void fetchMerge();
                  void fetchDrafts(sourceFilter);
                }}
                onCancel={() => setMergePreview(null)}
              />
            ) : (
            <div
              key={sug.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-foreground">{sug.sourceName}</span>
                    <GitMerge size={14} className="text-muted-foreground" />
                    <span className="font-medium text-foreground">{sug.targetName}</span>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{sug.reason}</p>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>置信度 {(sug.confidence * 100).toFixed(0)}%</span>
                    <Badge variant="outline" className="text-xs">
                      {sug.status === "PENDING" ? "待处理" : sug.status === "ACCEPTED" ? "已接受" : sug.status === "REJECTED" ? "已拒绝" : "已暂缓"}
                    </Badge>
                  </div>
                </div>
                {sug.status === "PENDING" && (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      onClick={() => {
                        setMergePreview({
                          suggestionId : sug.id,
                          sourcePromise: fetchPersonaSummary(sug.sourcePersonaId),
                          targetPromise: fetchPersonaSummary(sug.targetPersonaId)
                        });
                      }}
                    >
                      接受合并
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => { void handleMergeAction(sug.id, "reject"); }}
                    >
                      拒绝
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { void handleMergeAction(sug.id, "defer"); }}
                    >
                      稍后
                    </Button>
                  </div>
                )}
              </div>
            </div>
            )
          ))}
        </div>
      )}

      {/* Alias mappings tab */}
      {!loading && activeTab === "aliases" && (
        <AliasReviewTab
          bookId={bookId}
          aliasMappings={aliasMappings}
          onRefresh={() => { void fetchAliases(); }}
        />
      )}

      {/* Validation reports tab */}
      {!loading && activeTab === "validation" && (
        <ValidationReportTab
          bookId={bookId}
          reports={validationReports}
          onRefresh={() => { void fetchValidation(); }}
        />
      )}
    </div>
  );

  // Helper: single-item verify/reject via bulk API
  async function handleBulkAction(ids: string[], action: "verify" | "reject") {
    try {
      if (action === "verify") await bulkVerifyDrafts(ids);
      else                     await bulkRejectDrafts(ids);
      void fetchDrafts(sourceFilter);
    } catch {
      // Silent
    }
  }
}

/* ------------------------------------------------
   Empty state
   ------------------------------------------------ */
function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="mb-3 rounded-full bg-muted p-3">
        <Check size={20} className="text-success" />
      </div>
      <p className="text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
