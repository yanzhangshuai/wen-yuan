"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Download,
  Pencil,
  Plus,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X
} from "lucide-react";

import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  getKnowledgePackScopeDescription,
  getKnowledgePackScopeLabel,
  KNOWLEDGE_ENTRY_TYPE_OPTIONS
} from "@/lib/knowledge-presentation";

import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  batchRejectEntries,
  batchVerifyEntries,
  deleteEntry,
  deleteKnowledgePack,
  fetchEntries,
  fetchKnowledgePacks,
  getExportUrl,
  rejectEntry,
  type KnowledgeEntryItem,
  type KnowledgePackItem,
  updateEntry,
  verifyEntry
} from "@/lib/services/knowledge";

import { AliasChipsInput, normalizeAliasValues } from "./_components/alias-chips-input";
import { PackForm } from "./_components/pack-form";
import { EntryForm } from "./_components/entry-form";

type EntryTypeValue = "CHARACTER" | "LOCATION" | "ORGANIZATION";

interface EntryEditorDraft {
  canonicalName: string;
  aliases      : string[];
  entryType    : EntryTypeValue;
  notes        : string;
  confidence   : string;
}

function statusLabel(status: string): string {
  switch (status) {
    case "VERIFIED":
      return "已验证";
    case "REJECTED":
      return "已拒绝";
    default      :
      return "待审核";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="success">{statusLabel(status)}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{statusLabel(status)}</Badge>;
    default      :
      return <Badge variant="warning">{statusLabel(status)}</Badge>;
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case "LLM_GENERATED":
      return "模型生成";
    case "IMPORTED"     :
      return "导入";
    case "MANUAL"       :
      return "手动";
    default            :
      return source;
  }
}

function normalizeOverlapLookupTerm(value: string): string {
  return value.trim().toLowerCase();
}

function toEntryTypeValue(value: string): EntryTypeValue {
  if (value === "LOCATION" || value === "ORGANIZATION") {
    return value;
  }
  return "CHARACTER";
}

function createEntryEditorDraft(entry: Pick<KnowledgeEntryItem, "canonicalName" | "aliases" | "entryType" | "notes" | "confidence">): EntryEditorDraft {
  return {
    canonicalName: entry.canonicalName,
    aliases      : [...entry.aliases],
    entryType    : toEntryTypeValue(entry.entryType),
    notes        : entry.notes ?? "",
    confidence   : entry.confidence.toFixed(2)
  };
}

function buildEntryOverlapPreview(input: {
  entryId?     : string;
  canonicalName: string;
  aliases      : string[];
  entries      : KnowledgeEntryItem[];
}): { overlapEntries: string[]; overlapTerms: string[] } {
  const currentTerms = normalizeAliasValues([input.canonicalName, ...input.aliases]).map((term) => ({
    raw       : term,
    normalized: normalizeOverlapLookupTerm(term)
  }));
  const overlapEntries = new Set<string>();
  const overlapTerms   = new Set<string>();

  for (const entry of input.entries) {
    if (entry.id === input.entryId) continue;

    const otherTerms = new Set(
      normalizeAliasValues([entry.canonicalName, ...entry.aliases]).map((term) => normalizeOverlapLookupTerm(term))
    );

    for (const term of currentTerms) {
      if (!term.normalized || !otherTerms.has(term.normalized)) continue;
      overlapEntries.add(entry.canonicalName);
      overlapTerms.add(term.raw);
    }
  }

  return {
    overlapEntries: Array.from(overlapEntries),
    overlapTerms  : Array.from(overlapTerms)
  };
}

/**
 * `/admin/knowledge-base/alias-packs`
 * 人物别名知识包管理页：左栏包列表 + 右栏条目管理。
 * 所有 Dialog/Sheet 已迁移为子路由（new/edit/entries-new/generate/import）或内联面板，
 * 仅保留 AlertDialog 用于不可恢复的删除确认。
 */
export default function AliasPacksPage() {
  const searchParams = useSearchParams();
  const presetBookTypeId = searchParams.get("bookTypeId");
  const presetPackId     = searchParams.get("packId");

  const [bookTypes, setBookTypes]                 = useState<BookTypeItem[]>([]);
  const [packs, setPacks]                         = useState<KnowledgePackItem[]>([]);
  const [selectedPack, setSelectedPack]           = useState<KnowledgePackItem | null>(null);
  const [filterBookTypeId, setFilterBookTypeId]   = useState<string>(presetBookTypeId ?? "all");
  const [loading, setLoading]                     = useState(true);
  const [deletePackTarget, setDeletePackTarget]   = useState<KnowledgePackItem | null>(null);
  const [deletingPack, setDeletingPack]           = useState(false);
  const [creatingPack, setCreatingPack]           = useState(false);
  const { toast } = useToast();

  const loadPacks = useCallback(async () => {
    try {
      setLoading(true);
      const [bt, pk] = await Promise.all([
        fetchBookTypes(),
        fetchKnowledgePacks({ bookTypeId: filterBookTypeId !== "all" ? filterBookTypeId : undefined })
      ]);
      setBookTypes(bt);
      setPacks(pk);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filterBookTypeId, toast]);

  useEffect(() => { void loadPacks(); }, [loadPacks]);

  // 初始 packId 预选
  useEffect(() => {
    if (!presetPackId || packs.length === 0) return;
    if (selectedPack?.id === presetPackId) return;
    const target = packs.find((pack) => pack.id === presetPackId);
    if (target) setSelectedPack(target);
  }, [presetPackId, packs, selectedPack]);

  // 同步刷新后的选中包
  useEffect(() => {
    if (!selectedPack) return;
    const next = packs.find((pack) => pack.id === selectedPack.id) ?? null;
    if (!next) { setSelectedPack(null); return; }
    if (next !== selectedPack) setSelectedPack(next);
  }, [packs, selectedPack]);

  async function handleDeletePackConfirmed(pack: KnowledgePackItem) {
    setDeletingPack(true);
    try {
      await deleteKnowledgePack(pack.id);
      toast({ title: "删除成功" });
      setDeletePackTarget(null);
      if (selectedPack?.id === pack.id) setSelectedPack(null);
      await loadPacks();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    } finally {
      setDeletingPack(false);
    }
  }

  return (
    <PageContainer>
      <PageHeader
        title="人物别名知识包"
        description="管理人物别名知识包与条目，支持审核、批量操作"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库",   href: "/admin/knowledge-base" },
          { label: "别名知识包" }
        ]}
      >
        {selectedPack ? (
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/knowledge-base/alias-packs/${selectedPack.id}/edit`}>
              <Pencil className="mr-1 h-4 w-4" />
              编辑当前知识包
            </Link>
          </Button>
        ) : null}
        <Button size="sm" type="button" onClick={() => setCreatingPack(true)} disabled={creatingPack}>
          <Plus className="mr-1 h-4 w-4" />
          新建知识包
        </Button>
      </PageHeader>

      {creatingPack ? (
        <div className="mb-4 rounded-md border bg-muted/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">新建知识包</h3>
              <div className="mt-1 text-xs text-muted-foreground">创建一个新的人物别名知识包。</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="关闭"
              onClick={() => setCreatingPack(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <PackForm
            initial={null}
            bookTypes={bookTypes}
            redirectTo="/admin/knowledge-base/alias-packs"
            onSuccess={() => { setCreatingPack(false); void loadPacks(); }}
            onCancel={() => setCreatingPack(false)}
          />
        </div>
      ) : null}

      <div className="flex gap-6">
        <div className="w-72 shrink-0">
          <div className="mb-3">
            <Select value={filterBookTypeId} onValueChange={setFilterBookTypeId}>
              <SelectTrigger className="w-full"><SelectValue placeholder="筛选书籍类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                {bookTypes.map((bt) => (
                  <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">加载中...</div>
          ) : packs.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">暂无知识包</div>
          ) : (
            <div className="flex flex-col gap-1">
              {packs.map((pack) => (
                <div
                  key={pack.id}
                  className={`cursor-pointer rounded-md border p-3 transition-colors hover:bg-muted ${
                    selectedPack?.id === pack.id ? "border-primary bg-muted" : ""
                  }`}
                  onClick={() => setSelectedPack(pack)}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{pack.name}</span>
                    <div className="flex items-center gap-1">
                      {(pack.statusCounts.PENDING ?? 0) > 0 ? (
                        <Badge variant="destructive" className="text-[10px]">待审 {pack.statusCounts.PENDING}</Badge>
                      ) : null}
                      <Badge variant="outline" className="text-xs">{getKnowledgePackScopeLabel(pack.scope)}</Badge>
                    </div>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                    <span>{pack.bookType?.name ?? "无类型"}</span>
                    <span>·</span>
                    <span>{pack._count.entries} 条</span>
                    <span>·</span>
                    <span>v{pack.version}</span>
                  </div>
                  <div className="mt-1 flex gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      aria-label={`删除知识包 ${pack.name}`}
                      onClick={(event) => { event.stopPropagation(); setDeletePackTarget(pack); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex-1">
          {selectedPack ? (
            <EntryList pack={selectedPack} onRefresh={loadPacks} />
          ) : (
            <div className="flex h-64 items-center justify-center text-muted-foreground">
              请在左侧选择一个知识包
            </div>
          )}
        </div>
      </div>

      <AlertDialog
        open={deletePackTarget !== null}
        onOpenChange={(open) => { if (!open && !deletingPack) setDeletePackTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除知识包</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除知识包「{deletePackTarget?.name ?? ""}」及其所有条目吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={deletingPack} onClick={() => setDeletePackTarget(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingPack || !deletePackTarget}
              onClick={() => { if (deletePackTarget) void handleDeletePackConfirmed(deletePackTarget); }}
            >
              {deletingPack ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

function EntryList({
  pack,
  onRefresh
}: {
  pack     : KnowledgePackItem;
  onRefresh: () => Promise<void>;
}) {
  const [entries, setEntries]                       = useState<KnowledgeEntryItem[]>([]);
  const [total, setTotal]                           = useState(0);
  const [page, setPage]                             = useState(1);
  const [filterStatus, setFilterStatus]             = useState<string>("all");
  const [search, setSearch]                         = useState("");
  const [loading, setLoading]                       = useState(true);
  const [selected, setSelected]                     = useState<Set<string>>(new Set());
  const [editingEntryId, setEditingEntryId]         = useState<string | null>(null);
  const [editingDraft, setEditingDraft]             = useState<EntryEditorDraft | null>(null);
  const [savingEntryId, setSavingEntryId]           = useState<string | null>(null);
  const [deleteEntryTarget, setDeleteEntryTarget]   = useState<KnowledgeEntryItem | null>(null);
  const [deletingEntry, setDeletingEntry]           = useState(false);

  // 拒绝面板（替代原 Dialog）
  const [rejectMode, setRejectMode]                 = useState<"single" | "batch" | null>(null);
  const [rejectTargetId, setRejectTargetId]         = useState("");
  const [rejectNote, setRejectNote]                 = useState("");
  const [rejectSubmitting, setRejectSubmitting]     = useState(false);
  const [creatingEntry, setCreatingEntry]           = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const result = await fetchEntries(pack.id, {
        reviewStatus: filterStatus !== "all" ? filterStatus : undefined,
        q           : search || undefined,
        page
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch (error) {
      toast({ title: "加载条目失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [pack.id, filterStatus, search, page, toast]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setPage(1);
    setSelected(new Set());
    setEditingEntryId(null);
    setEditingDraft(null);
    setRejectMode(null);
  }, [pack.id, filterStatus, search]);

  const editingOverlap = useMemo(() => {
    if (!editingDraft) return { overlapEntries: [], overlapTerms: [] };
    return buildEntryOverlapPreview({
      entryId      : editingEntryId ?? undefined,
      canonicalName: editingDraft.canonicalName,
      aliases      : editingDraft.aliases,
      entries
    });
  }, [editingDraft, editingEntryId, entries]);

  const refreshAll = useCallback(async () => {
    await Promise.all([load(), onRefresh()]);
  }, [load, onRefresh]);

  function beginEditing(entry: KnowledgeEntryItem) {
    setEditingEntryId(entry.id);
    setEditingDraft(createEntryEditorDraft(entry));
  }

  function cancelEditing() {
    setEditingEntryId(null);
    setEditingDraft(null);
  }

  function updateDraft<K extends keyof EntryEditorDraft>(field: K, value: EntryEditorDraft[K]) {
    setEditingDraft((previous) => previous ? { ...previous, [field]: value } : previous);
  }

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selected.size === entries.length) setSelected(new Set());
    else setSelected(new Set(entries.map((entry) => entry.id)));
  }

  async function handleVerify(id: string) {
    try {
      await verifyEntry(id);
      toast({ title: "审核通过" });
      await refreshAll();
    } catch (error) {
      toast({ title: "操作失败", description: String(error), variant: "destructive" });
    }
  }

  function openRejectPanel(mode: "single" | "batch", targetId = "") {
    setRejectMode(mode);
    setRejectTargetId(targetId);
    setRejectNote("");
  }

  function closeRejectPanel() {
    if (rejectSubmitting) return;
    setRejectMode(null);
    setRejectTargetId("");
    setRejectNote("");
  }

  async function handleRejectConfirmed() {
    const note = rejectNote.trim() || undefined;
    setRejectSubmitting(true);
    try {
      if (rejectMode === "single") {
        if (!rejectTargetId) return;
        await rejectEntry(rejectTargetId, note);
        toast({ title: "已拒绝" });
      } else if (rejectMode === "batch") {
        const selectedIds = Array.from(selected);
        if (selectedIds.length === 0) {
          toast({ title: "请先选择条目", variant: "destructive" });
          return;
        }
        await batchRejectEntries(pack.id, selectedIds, note);
        toast({ title: `成功拒绝 ${selectedIds.length} 条` });
        setSelected(new Set());
      }
      setRejectMode(null);
      setRejectTargetId("");
      setRejectNote("");
      await refreshAll();
    } catch (error) {
      toast({ title: "操作失败", description: String(error), variant: "destructive" });
    } finally {
      setRejectSubmitting(false);
    }
  }

  async function handleBatchVerify() {
    if (selected.size === 0) return;
    try {
      await batchVerifyEntries(pack.id, Array.from(selected));
      toast({ title: `成功审核 ${selected.size} 条` });
      setSelected(new Set());
      await refreshAll();
    } catch (error) {
      toast({ title: "批量审核失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDeleteConfirmed(entry: KnowledgeEntryItem) {
    setDeletingEntry(true);
    try {
      await deleteEntry(entry.id);
      if (editingEntryId === entry.id) cancelEditing();
      toast({ title: "删除成功" });
      setDeleteEntryTarget(null);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(entry.id);
        return next;
      });
      await refreshAll();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    } finally {
      setDeletingEntry(false);
    }
  }

  const rejectTargetEntry = entries.find((entry) => entry.id === rejectTargetId) ?? null;

  async function handleSaveEntryEdit(entry: KnowledgeEntryItem) {
    if (!editingDraft) return;
    const canonicalName = editingDraft.canonicalName.trim();
    if (!canonicalName) {
      toast({ title: "标准名不能为空", variant: "destructive" });
      return;
    }
    const aliases = normalizeAliasValues(editingDraft.aliases.filter((alias) => alias.trim() !== canonicalName));
    const parsedConfidence = Number.parseFloat(editingDraft.confidence);
    const confidence = Number.isFinite(parsedConfidence)
      ? Math.max(0, Math.min(1, parsedConfidence))
      : entry.confidence;

    try {
      setSavingEntryId(entry.id);
      await updateEntry(entry.id, {
        canonicalName,
        aliases,
        entryType: editingDraft.entryType,
        notes    : editingDraft.notes.trim() ? editingDraft.notes.trim() : null,
        confidence
      });
      toast({ title: "条目已更新" });
      cancelEditing();
      await refreshAll();
    } catch (error) {
      toast({ title: "更新失败", description: String(error), variant: "destructive" });
    } finally {
      setSavingEntryId(null);
    }
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{pack.name}</h3>
          <p className="text-sm text-muted-foreground">
            {getKnowledgePackScopeDescription(pack.scope)}
            {" · "}已验证 {pack.statusCounts.VERIFIED ?? 0} 条
            {" · "}待审核 {pack.statusCounts.PENDING ?? 0} 条
            {" · "}v{pack.version}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/knowledge-base/alias-packs/${pack.id}/import`}>
              <Upload className="mr-1 h-3.5 w-3.5" />
              导入
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <a href={getExportUrl(pack.id, "json", "verified")} download>
              <Download className="mr-1 h-3.5 w-3.5" />
              导出已验证
            </a>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <a href={getExportUrl(pack.id, "json", "all")} download>导出全部</a>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href={`/admin/knowledge-base/alias-packs/${pack.id}/generate`}>
              <Sparkles className="mr-1 h-3.5 w-3.5" />
              模型生成
            </Link>
          </Button>
          <Button size="sm" type="button" onClick={() => setCreatingEntry(true)} disabled={creatingEntry}>
            <Plus className="mr-1 h-3.5 w-3.5" />
            添加条目
          </Button>
        </div>
      </div>

      {creatingEntry ? (
        <div className="mb-3 rounded-md border bg-muted/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold">新增条目</h3>
              <div className="mt-1 text-xs text-muted-foreground">为知识包「{pack.name}」添加新的人物条目。</div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="关闭"
              onClick={() => setCreatingEntry(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <EntryForm
            packId={pack.id}
            redirectTo={`/admin/knowledge-base/alias-packs?packId=${pack.id}`}
            onSuccess={() => { setCreatingEntry(false); void load(); void onRefresh(); }}
            onCancel={() => setCreatingEntry(false)}
          />
        </div>
      ) : null}

      <div className="mb-3 flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部</SelectItem>
            <SelectItem value="PENDING">待审核</SelectItem>
            <SelectItem value="VERIFIED">已验证</SelectItem>
            <SelectItem value="REJECTED">已拒绝</SelectItem>
          </SelectContent>
        </Select>

        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-8"
            placeholder="搜索人物名或别名..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        {selected.size > 0 ? (
          <>
            <Button size="sm" onClick={() => void handleBatchVerify()}>
              <Check className="mr-1 h-3.5 w-3.5" />
              批量通过 ({selected.size})
            </Button>
            <Button variant="outline" size="sm" onClick={() => openRejectPanel("batch")}>
              <X className="mr-1 h-3.5 w-3.5" />
              批量拒绝
            </Button>
          </>
        ) : null}
      </div>

      {rejectMode !== null ? (
        <div className="mb-3 rounded-md border bg-muted/30 p-4">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">
                {rejectMode === "single" ? "拒绝条目" : "批量拒绝条目"}
              </div>
              <div className="mt-1 text-xs text-muted-foreground">
                {rejectMode === "single"
                  ? `将条目「${rejectTargetEntry?.canonicalName ?? ""}」标记为已拒绝，可选填写拒绝原因。`
                  : `将所选 ${selected.size} 条条目标记为已拒绝，可选填写统一拒绝原因。`}
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="关闭"
              disabled={rejectSubmitting}
              onClick={closeRejectPanel}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2">
            <Label htmlFor={`reject-note-${pack.id}`}>拒绝原因（可选）</Label>
            <Textarea
              id={`reject-note-${pack.id}`}
              rows={3}
              value={rejectNote}
              disabled={rejectSubmitting}
              onChange={(event) => setRejectNote(event.target.value)}
              placeholder={rejectMode === "single" ? "例如：与已有条目重复，或上下文不足以支持采纳。" : "例如：本批条目来源不可靠，需补充依据后再提交。"}
            />
          </div>
          <div className="mt-3 flex justify-end gap-2">
            <Button type="button" variant="outline" disabled={rejectSubmitting} onClick={closeRejectPanel}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={rejectSubmitting || (rejectMode === "single" ? !rejectTargetId : selected.size === 0)}
              onClick={() => void handleRejectConfirmed()}
            >
              {rejectSubmitting ? "提交中..." : rejectMode === "single" ? "确认拒绝" : `确认拒绝 ${selected.size} 条`}
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mb-3 text-xs text-muted-foreground">
        单击条目行可展开内联编辑器；橙色提示表示与现有标准名或别名发生重叠，保存前应先复核。
      </div>

      {loading ? (
        <div className="py-8 text-center text-muted-foreground">加载中...</div>
      ) : entries.length === 0 ? (
        <div className="py-8 text-center text-muted-foreground">暂无条目</div>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={selected.size === entries.length && entries.length > 0}
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead>标准名</TableHead>
                <TableHead>别名</TableHead>
                <TableHead className="w-24">来源</TableHead>
                <TableHead className="w-20">置信度</TableHead>
                <TableHead className="w-20">状态</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry) => {
                const isEditing      = editingEntryId === entry.id;
                const overlapEntries = entry.overlapEntries ?? [];
                const overlapTerms   = entry.overlapTerms ?? [];

                return (
                  <Fragment key={entry.id}>
                    <TableRow className={`cursor-pointer align-top ${isEditing ? "bg-muted/40" : ""}`} onClick={() => beginEditing(entry)}>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox checked={selected.has(entry.id)} onCheckedChange={() => toggleSelect(entry.id)} />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <span>{entry.canonicalName}</span>
                          {isEditing ? <Badge variant="outline">编辑中</Badge> : null}
                        </div>
                        {overlapEntries.length > 0 ? (
                          <div className="mt-1 flex items-start gap-1 text-xs text-amber-700">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <span>
                              与 {overlapEntries.join("、")} 重叠
                              {overlapTerms.length > 0 ? `（命中：${overlapTerms.join("、")}）` : ""}
                            </span>
                          </div>
                        ) : null}
                        {entry.notes ? <div className="mt-1 text-xs text-muted-foreground">备注：{entry.notes}</div> : null}
                        {entry.reviewNote ? <div className="mt-1 text-xs text-destructive">拒绝原因：{entry.reviewNote}</div> : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entry.aliases.slice(0, 5).map((alias) => (
                            <Badge key={alias} variant="secondary" className="text-xs">{alias}</Badge>
                          ))}
                          {entry.aliases.length > 5 ? (
                            <Badge variant="outline" className="text-xs">+{entry.aliases.length - 5}</Badge>
                          ) : null}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {sourceLabel(entry.source)}
                        {entry.sourceDetail ? <div className="mt-1 text-[11px]">{entry.sourceDetail}</div> : null}
                      </TableCell>
                      <TableCell className="text-xs">{entry.confidence.toFixed(2)}</TableCell>
                      <TableCell>{statusBadge(entry.reviewStatus)}</TableCell>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => beginEditing(entry)}>编辑</Button>
                          {entry.reviewStatus === "PENDING" ? (
                            <>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-1.5"
                                aria-label={`通过条目 ${entry.canonicalName}`}
                                onClick={() => void handleVerify(entry.id)}
                              >
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-1.5"
                                aria-label={`拒绝条目 ${entry.canonicalName}`}
                                onClick={() => openRejectPanel("single", entry.id)}
                              >
                                <X className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </>
                          ) : null}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-1.5"
                            aria-label={`删除条目 ${entry.canonicalName}`}
                            onClick={() => setDeleteEntryTarget(entry)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                    {isEditing && editingDraft ? (
                      <TableRow className="bg-muted/10">
                        <TableCell colSpan={7}>
                          <div className="grid gap-4 rounded-md border bg-background p-4">
                            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px_180px]">
                              <div className="grid gap-2">
                                <Label htmlFor={`entry-canonical-${entry.id}`}>标准名</Label>
                                <Input
                                  id={`entry-canonical-${entry.id}`}
                                  value={editingDraft.canonicalName}
                                  onChange={(event) => updateDraft("canonicalName", event.target.value)}
                                  placeholder="如：关羽"
                                />
                              </div>
                              <div className="grid gap-2">
                                <Label>条目类型</Label>
                                <Select value={editingDraft.entryType} onValueChange={(value) => updateDraft("entryType", value as EntryTypeValue)}>
                                  <SelectTrigger><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    {KNOWLEDGE_ENTRY_TYPE_OPTIONS.map((option) => (
                                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="grid gap-2">
                                <Label htmlFor={`entry-confidence-${entry.id}`}>置信度</Label>
                                <Input
                                  id={`entry-confidence-${entry.id}`}
                                  type="number"
                                  min="0"
                                  max="1"
                                  step="0.01"
                                  value={editingDraft.confidence}
                                  onChange={(event) => updateDraft("confidence", event.target.value)}
                                />
                              </div>
                            </div>

                            <div className="grid gap-2">
                              <Label>别名</Label>
                              <AliasChipsInput
                                values={editingDraft.aliases}
                                onChange={(aliases) => updateDraft("aliases", aliases)}
                                placeholder="输入别名后按 Enter、逗号或失焦添加"
                              />
                            </div>

                            <div className="grid gap-2">
                              <Label htmlFor={`entry-notes-${entry.id}`}>备注</Label>
                              <Textarea
                                id={`entry-notes-${entry.id}`}
                                rows={3}
                                value={editingDraft.notes}
                                onChange={(event) => updateDraft("notes", event.target.value)}
                                placeholder="可记录适用范围、命名来源或人工校验说明"
                              />
                            </div>

                            <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
                              来源：{sourceLabel(entry.source)}
                              {entry.sourceDetail ? ` · ${entry.sourceDetail}` : ""}
                              {" · "}当前状态：{statusLabel(entry.reviewStatus)}
                            </div>

                            {editingOverlap.overlapEntries.length > 0 ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                当前编辑结果与 {editingOverlap.overlapEntries.join("、")} 存在重叠，命中词：{editingOverlap.overlapTerms.join("、")}。
                              </div>
                            ) : null}

                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={cancelEditing}>取消</Button>
                              <Button
                                size="sm"
                                onClick={() => void handleSaveEntryEdit(entry)}
                                disabled={savingEntryId === entry.id || !editingDraft.canonicalName.trim()}
                              >
                                {savingEntryId === entry.id ? "保存中..." : "保存更改"}
                              </Button>
                            </div>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </Fragment>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {total > 50 ? (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">第 {page} 页 / 共 {Math.ceil(total / 50)} 页</span>
          <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      ) : null}

      <AlertDialog
        open={deleteEntryTarget !== null}
        onOpenChange={(open) => { if (!open && !deletingEntry) setDeleteEntryTarget(null); }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除条目</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除条目「{deleteEntryTarget?.canonicalName ?? ""}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button type="button" variant="outline" disabled={deletingEntry} onClick={() => setDeleteEntryTarget(null)}>取消</Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletingEntry || !deleteEntryTarget}
              onClick={() => { if (deleteEntryTarget) void handleDeleteConfirmed(deleteEntryTarget); }}
            >
              {deletingEntry ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
