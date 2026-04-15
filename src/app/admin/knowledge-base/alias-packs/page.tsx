"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import { useSearchParams } from "next/navigation";
import { AlertTriangle, Check, Download, Plus, Search, Sparkles, Trash2, Upload, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import {
  PageContainer,
  PageHeader
} from "@/components/layout/page-header";
import { useToast } from "@/hooks/use-toast";
import {
  getKnowledgePackScopeDescription,
  getKnowledgePackScopeLabel,
  KNOWLEDGE_ENTRY_TYPE_OPTIONS,
  KNOWLEDGE_PACK_SCOPE_OPTIONS
} from "@/lib/knowledge-presentation";

import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  type KnowledgePackItem,
  type KnowledgeEntryItem,
  fetchKnowledgePacks,
  createKnowledgePack,
  updateKnowledgePack,
  deleteKnowledgePack,
  fetchEntries,
  createEntry,
  updateEntry,
  deleteEntry,
  verifyEntry,
  rejectEntry,
  batchVerifyEntries,
  batchRejectEntries,
  getExportUrl,
  importEntries as importKnowledgeEntries,
  previewGenerateEntriesPrompt,
  reviewGenerateEntries,
  pollAliasPackGenerationJob,
  fetchGenerationBooks,
  type AliasPackGenerationPreview,
  type AliasPackGenerationReviewResult,
  type AliasPackGeneratedCandidate,
  type AliasPackGenerationJobStatus,
  type KnowledgeGenerationBookOption
} from "@/lib/services/knowledge";
import { useAdminModels } from "@/hooks/use-admin-models";

type ImportFormat = "JSON" | "CSV";
type EntryTypeValue = "CHARACTER" | "LOCATION" | "ORGANIZATION";

const UNLINKED_BOOK_TYPE_VALUE = "__UNLINKED_BOOK_TYPE__";

interface ParsedImportPreview {
  entries: Array<{ canonicalName: string; aliases: string[]; entryType?: string; notes?: string }>;
  errors : string[];
}

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
    default:
      return "待审核";
  }
}

function statusBadge(status: string) {
  switch (status) {
    case "VERIFIED":
      return <Badge variant="success">{statusLabel(status)}</Badge>;
    case "REJECTED":
      return <Badge variant="destructive">{statusLabel(status)}</Badge>;
    default:
      return <Badge variant="warning">{statusLabel(status)}</Badge>;
  }
}

function sourceLabel(source: string): string {
  switch (source) {
    case "LLM_GENERATED":
      return "模型生成";
    case "IMPORTED":
      return "导入";
    case "MANUAL":
      return "手动";
    default:
      return source;
  }
}

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === "," && !quoted) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
}

function parseImportPreview(format: ImportFormat, rawContent: string): ParsedImportPreview {
  if (!rawContent.trim()) {
    return { entries: [], errors: [] };
  }

  if (format === "JSON") {
    try {
      const parsed = JSON.parse(rawContent) as unknown;
      const rows = Array.isArray(parsed)
        ? parsed
        : typeof parsed === "object" && parsed !== null && Array.isArray((parsed as { entries?: unknown[] }).entries)
          ? (parsed as { entries: unknown[] }).entries
          : null;

      if (!rows) {
        return { entries: [], errors: ["JSON 需为条目数组，或包含 entries 数组的对象"] };
      }

      const entries: ParsedImportPreview["entries"] = [];
      const errors: string[] = [];

      rows.forEach((row, index) => {
        if (!row || typeof row !== "object") {
          errors.push(`第 ${index + 1} 条不是对象`);
          return;
        }

        const record = row as {
          canonicalName?: unknown;
          aliases?      : unknown;
          entryType?    : unknown;
          notes?        : unknown;
        };
        const canonicalName = typeof record.canonicalName === "string" ? record.canonicalName.trim() : "";
        if (!canonicalName) {
          errors.push(`第 ${index + 1} 条缺少 canonicalName`);
          return;
        }

        const aliases = Array.isArray(record.aliases)
          ? record.aliases.filter((value): value is string => typeof value === "string").map((value) => value.trim()).filter(Boolean)
          : typeof record.aliases === "string"
            ? record.aliases.split(/[|,，\n]/).map((value) => value.trim()).filter(Boolean)
            : [];

        entries.push({
          canonicalName,
          aliases,
          entryType: typeof record.entryType === "string" && record.entryType.trim() ? record.entryType.trim() : "CHARACTER",
          notes    : typeof record.notes === "string" && record.notes.trim() ? record.notes.trim() : undefined
        });
      });

      return { entries, errors };
    } catch (error) {
      return { entries: [], errors: [String(error)] };
    }
  }

  const lines = rawContent.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length === 0) {
    return { entries: [], errors: [] };
  }

  const header = splitCsvLine(lines[0]);
  const canonicalIndex = header.indexOf("canonicalName");
  const aliasesIndex = header.indexOf("aliases");
  const entryTypeIndex = header.indexOf("entryType");
  const notesIndex = header.indexOf("notes");

  if (canonicalIndex === -1 || aliasesIndex === -1) {
    return { entries: [], errors: ["CSV 需包含 canonicalName 与 aliases 列"] };
  }

  const entries: ParsedImportPreview["entries"] = [];
  const errors: string[] = [];

  for (let lineIndex = 1; lineIndex < lines.length; lineIndex += 1) {
    const columns = splitCsvLine(lines[lineIndex]);
    const canonicalName = (columns[canonicalIndex] ?? "").trim();
    if (!canonicalName) {
      errors.push(`第 ${lineIndex + 1} 行缺少 canonicalName`);
      continue;
    }

    const aliases = (columns[aliasesIndex] ?? "")
      .split("|")
      .map((value) => value.trim())
      .filter(Boolean);

    entries.push({
      canonicalName,
      aliases,
      entryType: entryTypeIndex >= 0 && columns[entryTypeIndex]?.trim() ? columns[entryTypeIndex].trim() : "CHARACTER",
      notes    : notesIndex >= 0 && columns[notesIndex]?.trim() ? columns[notesIndex] : undefined
    });
  }

  return { entries, errors };
}

function normalizeAliasValues(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
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
  const overlapTerms = new Set<string>();

  for (const entry of input.entries) {
    if (entry.id === input.entryId) {
      continue;
    }

    const otherTerms = new Set(
      normalizeAliasValues([entry.canonicalName, ...entry.aliases]).map((term) => normalizeOverlapLookupTerm(term))
    );

    for (const term of currentTerms) {
      if (!term.normalized || !otherTerms.has(term.normalized)) {
        continue;
      }

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
 */
export default function AliasPacksPage() {
  const searchParams = useSearchParams();
  const presetBookTypeId = searchParams.get("bookTypeId");

  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [packs, setPacks] = useState<KnowledgePackItem[]>([]);
  const [selectedPack, setSelectedPack] = useState<KnowledgePackItem | null>(null);
  const [filterBookTypeId, setFilterBookTypeId] = useState<string>(presetBookTypeId ?? "all");
  const [loading, setLoading] = useState(true);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editPackDialogOpen, setEditPackDialogOpen] = useState(false);
  const { toast } = useToast();

  const loadPacks = useCallback(async () => {
    try {
      setLoading(true);
      const [bt, pk] = await Promise.all([
        fetchBookTypes(),
        fetchKnowledgePacks({
          bookTypeId: filterBookTypeId !== "all" ? filterBookTypeId : undefined
        })
      ]);
      setBookTypes(bt);
      setPacks(pk);
    } catch (e) {
      toast({ title: "加载失败", description: String(e), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [filterBookTypeId, toast]);

  useEffect(() => { void loadPacks(); }, [loadPacks]);

  useEffect(() => {
    if (!selectedPack) {
      return;
    }

    const nextSelectedPack = packs.find((pack) => pack.id === selectedPack.id) ?? null;
    if (!nextSelectedPack) {
      setSelectedPack(null);
      return;
    }

    if (nextSelectedPack !== selectedPack) {
      setSelectedPack(nextSelectedPack);
    }
  }, [packs, selectedPack]);

  const handleCreatePack = async (data: {
    bookTypeId?: string; name: string; scope: string; description?: string;
  }) => {
    try {
      await createKnowledgePack(data);
      toast({ title: "知识包创建成功" });
      setCreateDialogOpen(false);
      await loadPacks();
    } catch (e) {
      toast({ title: "创建失败", description: String(e), variant: "destructive" });
    }
  };

  const handleDeletePack = async (pack: KnowledgePackItem) => {
    if (!confirm(`确定删除知识包「${pack.name}」及其所有条目吗？`)) return;
    try {
      await deleteKnowledgePack(pack.id);
      toast({ title: "删除成功" });
      if (selectedPack?.id === pack.id) setSelectedPack(null);
      await loadPacks();
    } catch (e) {
      toast({ title: "删除失败", description: String(e), variant: "destructive" });
    }
  };

  const handleUpdatePack = async (data: {
    id         : string;
    name       : string;
    description: string | null;
    isActive   : boolean;
  }) => {
    try {
      await updateKnowledgePack(data.id, {
        name       : data.name,
        description: data.description,
        isActive   : data.isActive
      });
      toast({ title: "知识包已更新" });
      setEditPackDialogOpen(false);
      await loadPacks();
    } catch (error) {
      toast({ title: "更新失败", description: String(error), variant: "destructive" });
    }
  };

  return (
    <PageContainer>
      <PageHeader
        title="人物别名知识包"
        description="管理人物别名知识包与条目，支持审核、批量操作"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "别名知识包" }
        ]}
      >
        {selectedPack ? (
          <Button variant="outline" onClick={() => setEditPackDialogOpen(true)} size="sm">
            编辑当前知识包
          </Button>
        ) : null}
        <Button onClick={() => setCreateDialogOpen(true)} size="sm">
          <Plus className="mr-1 h-4 w-4" />
          新建知识包
        </Button>
      </PageHeader>

      <div className="flex gap-6">
        {/* 左栏：知识包列表 */}
        <div className="w-72 shrink-0">
          <div className="mb-3">
            <Select value={filterBookTypeId} onValueChange={setFilterBookTypeId}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="筛选书籍类型" />
              </SelectTrigger>
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
                      variant="ghost"
                      size="sm"
                      className="h-6 px-1"
                      onClick={(e) => { e.stopPropagation(); void handleDeletePack(pack); }}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 右栏：条目管理 */}
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

      <CreatePackDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        bookTypes={bookTypes}
        onSave={handleCreatePack}
      />

      <EditPackDialog
        open={editPackDialogOpen}
        onOpenChange={setEditPackDialogOpen}
        pack={selectedPack}
        onSave={handleUpdatePack}
      />
    </PageContainer>
  );
}

/** 条目列表组件 */
function EntryList({ pack, onRefresh }: { pack: KnowledgePackItem; onRefresh: () => Promise<void> }) {
  const [entries, setEntries] = useState<KnowledgeEntryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<EntryEditorDraft | null>(null);
  const [savingEntryId, setSavingEntryId] = useState<string | null>(null);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [generationReview, setGenerationReview] = useState<AliasPackGenerationReviewResult | null>(null);
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
    } catch (e) {
      toast({ title: "加载条目失败", description: String(e), variant: "destructive" });
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
  }, [pack.id, filterStatus, search]);

  const editingOverlap = useMemo(() => {
    if (!editingDraft) {
      return { overlapEntries: [], overlapTerms: [] };
    }

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

  const beginEditing = (entry: KnowledgeEntryItem) => {
    setEditingEntryId(entry.id);
    setEditingDraft(createEntryEditorDraft(entry));
  };

  const cancelEditing = () => {
    setEditingEntryId(null);
    setEditingDraft(null);
  };

  const updateDraft = <K extends keyof EntryEditorDraft>(field: K, value: EntryEditorDraft[K]) => {
    setEditingDraft((previous) => {
      if (!previous) {
        return previous;
      }

      return {
        ...previous,
        [field]: value
      };
    });
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === entries.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(entries.map((e) => e.id)));
    }
  };

  const handleVerify = async (id: string) => {
    try {
      await verifyEntry(id);
      toast({ title: "审核通过" });
      await refreshAll();
    } catch (e) {
      toast({ title: "操作失败", description: String(e), variant: "destructive" });
    }
  };

  const handleReject = async (id: string) => {
    const note = prompt("拒绝原因（可选）：");
    try {
      await rejectEntry(id, note ?? undefined);
      toast({ title: "已拒绝" });
      await refreshAll();
    } catch (e) {
      toast({ title: "操作失败", description: String(e), variant: "destructive" });
    }
  };

  const handleBatchVerify = async () => {
    if (selected.size === 0) return;
    try {
      await batchVerifyEntries(pack.id, Array.from(selected));
      toast({ title: `成功审核 ${selected.size} 条` });
      setSelected(new Set());
      await refreshAll();
    } catch (e) {
      toast({ title: "批量审核失败", description: String(e), variant: "destructive" });
    }
  };

  const handleBatchReject = async () => {
    if (selected.size === 0) return;
    const note = prompt("批量拒绝原因（可选）：");
    try {
      await batchRejectEntries(pack.id, Array.from(selected), note ?? undefined);
      toast({ title: `成功拒绝 ${selected.size} 条` });
      setSelected(new Set());
      await refreshAll();
    } catch (e) {
      toast({ title: "批量拒绝失败", description: String(e), variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("确定删除该条目？")) return;
    try {
      await deleteEntry(id);
      if (editingEntryId === id) {
        cancelEditing();
      }
      toast({ title: "删除成功" });
      await refreshAll();
    } catch (e) {
      toast({ title: "删除失败", description: String(e), variant: "destructive" });
    }
  };

  const handleSaveEntryEdit = async (entry: KnowledgeEntryItem) => {
    if (!editingDraft) {
      return;
    }

    const canonicalName = editingDraft.canonicalName.trim();
    if (!canonicalName) {
      toast({ title: "标准名不能为空", variant: "destructive" });
      return;
    }

    const aliases = normalizeAliasValues(
      editingDraft.aliases.filter((alias) => alias.trim() !== canonicalName)
    );
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
  };

  const handleCreateEntry = async (data: {
    canonicalName: string; aliases: string[]; entryType?: string; notes?: string;
  }) => {
    try {
      await createEntry(pack.id, data);
      toast({ title: "条目创建成功" });
      setCreateDialogOpen(false);
      await refreshAll();
    } catch (e) {
      toast({ title: "创建失败", description: String(e), variant: "destructive" });
    }
  };

  const handleImportEntries = async (data: {
    entries     : Array<{ canonicalName: string; aliases: string[]; entryType?: string; notes?: string }>;
    reviewStatus: string;
  }) => {
    try {
      const result = await importKnowledgeEntries(pack.id, {
        entries     : data.entries,
        reviewStatus: data.reviewStatus as "PENDING" | "VERIFIED",
        source      : "IMPORTED",
        auditAction : "IMPORT"
      });
      toast({ title: "导入成功", description: `已写入 ${result.count} 条。` });
      setImportDialogOpen(false);
      await refreshAll();
    } catch (error) {
      toast({ title: "导入失败", description: String(error), variant: "destructive" });
    }
  };

  const handleGenerationReviewed = (review: AliasPackGenerationReviewResult) => {
    setGenerationReview(review);
    setGenerateDialogOpen(false);
    setReviewDialogOpen(true);
  };

  const handleSaveReviewedEntries = async (candidates: AliasPackGeneratedCandidate[]) => {
    if (!generationReview) {
      return;
    }

    try {
      const result = await importKnowledgeEntries(pack.id, {
        entries: candidates.map((candidate) => ({
          canonicalName: candidate.canonicalName,
          aliases      : candidate.aliases,
          entryType    : "CHARACTER",
          notes        : candidate.overlapEntries.length > 0
            ? `与已有条目重叠：${candidate.overlapEntries.join("、")}`
            : undefined,
          confidence: candidate.confidence
        })),
        reviewStatus: "PENDING",
        source      : "LLM_GENERATED",
        sourceDetail: `model=${generationReview.model.provider}/${generationReview.model.modelName}`,
        auditAction : "GENERATE"
      });
      toast({ title: "生成结果已保存", description: `写入 ${result.count} 条待审核候选。` });
      setReviewDialogOpen(false);
      setGenerationReview(null);
      await refreshAll();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    }
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">{pack.name}</h3>
          <p className="text-sm text-muted-foreground">
            {getKnowledgePackScopeDescription(pack.scope)}
            {" · "}
            已验证 {pack.statusCounts.VERIFIED ?? 0} 条
            {" · "}
            待审核 {pack.statusCounts.PENDING ?? 0} 条
            {" · "}
            v{pack.version}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setImportDialogOpen(true)}>
            <Upload className="mr-1 h-3.5 w-3.5" />导入
          </Button>
          <a href={getExportUrl(pack.id, "json", "verified")} download>
            <Button variant="outline" size="sm"><Download className="mr-1 h-3.5 w-3.5" />导出已验证</Button>
          </a>
          <a href={getExportUrl(pack.id, "json", "all")} download>
            <Button variant="ghost" size="sm">导出全部</Button>
          </a>
          <Button variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
            <Sparkles className="mr-1 h-3.5 w-3.5" />模型生成
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="mr-1 h-3.5 w-3.5" />添加条目
          </Button>
        </div>
      </div>

      <div className="mb-3 flex items-center gap-3">
        <Select value={filterStatus} onValueChange={setFilterStatus}>
          <SelectTrigger className="w-32">
            <SelectValue />
          </SelectTrigger>
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
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {selected.size > 0 && (
          <>
            <Button size="sm" onClick={() => void handleBatchVerify()}>
              <Check className="mr-1 h-3.5 w-3.5" />
              批量通过 ({selected.size})
            </Button>
            <Button variant="outline" size="sm" onClick={() => void handleBatchReject()}>
              <X className="mr-1 h-3.5 w-3.5" />
              批量拒绝
            </Button>
          </>
        )}
      </div>

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
                const isEditing = editingEntryId === entry.id;
                const overlapEntries = entry.overlapEntries ?? [];
                const overlapTerms = entry.overlapTerms ?? [];

                return (
                  <Fragment key={entry.id}>
                    <TableRow className={`cursor-pointer align-top ${isEditing ? "bg-muted/40" : ""}`} onClick={() => beginEditing(entry)}>
                      <TableCell onClick={(event) => event.stopPropagation()}>
                        <Checkbox
                          checked={selected.has(entry.id)}
                          onCheckedChange={() => toggleSelect(entry.id)}
                        />
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
                        {entry.notes ? (
                          <div className="mt-1 text-xs text-muted-foreground">备注：{entry.notes}</div>
                        ) : null}
                        {entry.reviewNote ? (
                          <div className="mt-1 text-xs text-destructive">拒绝原因：{entry.reviewNote}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {entry.aliases.slice(0, 5).map((alias) => (
                            <Badge key={alias} variant="secondary" className="text-xs">{alias}</Badge>
                          ))}
                          {entry.aliases.length > 5 && (
                            <Badge variant="outline" className="text-xs">+{entry.aliases.length - 5}</Badge>
                          )}
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
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => beginEditing(entry)}>
                            编辑
                          </Button>
                          {entry.reviewStatus === "PENDING" && (
                            <>
                              <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => void handleVerify(entry.id)}>
                                <Check className="h-3.5 w-3.5 text-green-600" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => void handleReject(entry.id)}>
                                <X className="h-3.5 w-3.5 text-red-500" />
                              </Button>
                            </>
                          )}
                          <Button variant="ghost" size="sm" className="h-7 px-1.5" onClick={() => void handleDelete(entry.id)}>
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
                                  <SelectTrigger>
                                    <SelectValue />
                                  </SelectTrigger>
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
                              {" · "}
                              当前状态：{statusLabel(entry.reviewStatus)}
                            </div>

                            {editingOverlap.overlapEntries.length > 0 ? (
                              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                                当前编辑结果与 {editingOverlap.overlapEntries.join("、")} 存在重叠，命中词：{editingOverlap.overlapTerms.join("、")}。
                              </div>
                            ) : null}

                            <div className="flex justify-end gap-2">
                              <Button variant="outline" size="sm" onClick={cancelEditing}>取消</Button>
                              <Button size="sm" onClick={() => void handleSaveEntryEdit(entry)} disabled={savingEntryId === entry.id || !editingDraft.canonicalName.trim()}>
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

      {total > 50 && (
        <div className="mt-4 flex items-center justify-center gap-2">
          <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>上一页</Button>
          <span className="text-sm text-muted-foreground">第 {page} 页 / 共 {Math.ceil(total / 50)} 页</span>
          <Button variant="outline" size="sm" disabled={page * 50 >= total} onClick={() => setPage((p) => p + 1)}>下一页</Button>
        </div>
      )}

      <CreateEntryDialog
        open={createDialogOpen}
        onOpenChange={setCreateDialogOpen}
        onSave={handleCreateEntry}
      />

      <ImportEntriesDialog
        open={importDialogOpen}
        pack={pack}
        onOpenChange={setImportDialogOpen}
        onImport={handleImportEntries}
      />

      <GenerateEntriesDialog
        open={generateDialogOpen}
        pack={pack}
        onOpenChange={setGenerateDialogOpen}
        onReviewed={handleGenerationReviewed}
      />

      <GenerationReviewDialog
        open={reviewDialogOpen}
        review={generationReview}
        onOpenChange={setReviewDialogOpen}
        onSave={handleSaveReviewedEntries}
      />
    </div>
  );
}

function AliasChipsInput({
  values,
  onChange,
  placeholder,
  disabled = false
}: {
  values      : string[];
  onChange    : (values: string[]) => void;
  placeholder?: string;
  disabled?   : boolean;
}) {
  const [inputValue, setInputValue] = useState("");

  const commitAliases = useCallback((rawValue: string) => {
    const nextAliases = normalizeAliasValues(rawValue.split(/[，,\n]/));
    if (nextAliases.length === 0) {
      setInputValue("");
      return;
    }

    onChange(normalizeAliasValues([...values, ...nextAliases]));
    setInputValue("");
  }, [onChange, values]);

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter" && event.key !== "," && event.key !== "，") {
      return;
    }

    event.preventDefault();
    commitAliases(inputValue);
  };

  return (
    <div className="grid gap-2">
      <div className="flex min-h-11 flex-wrap items-center gap-2 rounded-md border bg-background px-3 py-2">
        {values.map((alias) => (
          <Badge key={alias} variant="secondary" className="gap-1 pr-1 text-xs">
            {alias}
            <button
              type="button"
              className="rounded-sm p-0.5 text-muted-foreground transition-colors hover:bg-black/10 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
              onClick={() => onChange(values.filter((value) => value !== alias))}
              disabled={disabled}
            >
              <X className="h-3 w-3" />
            </button>
          </Badge>
        ))}
        <input
          className="min-w-32 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
          value={inputValue}
          onChange={(event) => setInputValue(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={() => commitAliases(inputValue)}
          placeholder={placeholder}
          disabled={disabled}
        />
      </div>
      <div className="text-xs text-muted-foreground">按 Enter、英文/中文逗号或离开输入框即可添加别名，点击 × 删除。</div>
    </div>
  );
}

/**
 * 功能：知识包“模型生成候选条目”弹框。
 * 输入：弹框开关、目标知识包、审核回调。
 * 输出：无（通过 `onReviewed` 把预审结果抛给上层）。
 * 异常：网络异常通过 toast 展示，不在组件内抛出。
 * 副作用：
 * - 打开弹框时会刷新模型缓存并拉取参考书籍列表；
 * - 触发预览/预审会调用后端接口并更新局部状态。
 */
function GenerateEntriesDialog({
  open,
  pack,
  onOpenChange,
  onReviewed
}: {
  open        : boolean;
  pack        : KnowledgePackItem;
  onOpenChange: (open: boolean) => void;
  onReviewed  : (review: AliasPackGenerationReviewResult) => void;
}) {
  const [targetCount, setTargetCount]                             = useState("50");
  const [additionalInstructions, setAdditionalInstructions]       = useState("");
  const [bookOptions, setBookOptions]                             = useState<KnowledgeGenerationBookOption[]>([]);
  const [selectedBookId, setSelectedBookId]                       = useState("none");
  const [selectedModelId, setSelectedModelId]                     = useState("");
  const [booksLoading, setBooksLoading]                           = useState(false);
  const [preview, setPreview]                                     = useState<AliasPackGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]                       = useState(false);
  const [generating, setGenerating]                               = useState(false);
  const [progressStep, setProgressStep]                           = useState("");
  const [elapsedSeconds, setElapsedSeconds]                       = useState(0);
  const pollingRef                                                 = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                                               = useRef<number>(0);
  const { toast }                                                 = useToast();

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 统一 Store：模块级缓存 + 后台重校验。
  // 这里额外读取 error/refresh，用于弹框内显式反馈与主动刷新。
  const {
    models: modelOptions,
    loading: modelsLoading,
    error: modelsError,
    defaultModel,
    refresh: refreshModels
  } = useAdminModels({ onlyEnabled: true });

  // 弹框打开时重置表单并加载书籍列表
  useEffect(() => {
    if (!open) {
      setPreview(null);
      return;
    }
    setTargetCount("50");
    setAdditionalInstructions("");
    setSelectedBookId("none");
    setSelectedModelId(defaultModel?.id ?? "");
    setBooksLoading(true);
    void fetchGenerationBooks()
      .then((books) => {
        setBookOptions(books);
      })
      .catch((error) => {
        toast({ title: "加载书籍列表失败", description: String(error), variant: "destructive" });
      })
      .finally(() => {
        setBooksLoading(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 每次打开弹框都触发一次模型列表刷新，避免跨页面切换后读到旧缓存。
  useEffect(() => {
    if (!open) {
      return;
    }

    refreshModels();
  }, [open, refreshModels]);

  // 模型从缓存/网络加载完成后，若当前还未选择，自动填入默认
  useEffect(() => {
    if (open && !selectedModelId && defaultModel) {
      setSelectedModelId(defaultModel.id);
    }
  }, [open, defaultModel, selectedModelId]);

  // 若当前已选模型在最新列表中不存在（被禁用/删除），自动清空并重新走默认模型回填逻辑。
  useEffect(() => {
    if (!open || !selectedModelId) {
      return;
    }

    const stillExists = modelOptions.some((model) => model.id === selectedModelId);
    if (!stillExists) {
      setSelectedModelId("");
    }
  }, [open, modelOptions, selectedModelId]);

  // 仅做提示词预览，不写库。
  const handlePreview = async () => {
    try {
      setPreviewLoading(true);
      const data = await previewGenerateEntriesPrompt(pack.id, {
        targetCount           : Number(targetCount) || 50,
        bookId                : selectedBookId !== "none" ? selectedBookId : undefined,
        additionalInstructions: additionalInstructions || undefined
      });
      setPreview(data);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  };

  // 进入“预审”阶段：调用 dry-run 接口得到候选并交由审核弹框处理。
  // 进入"预审"阶段：提交后台 job 并轮询结果。
  const handleGenerate = async () => {
    if (!selectedModelId) {
      toast({ title: "请先选择生成模型", variant: "destructive" });
      return;
    }
    try {
      setGenerating(true);
      setProgressStep("正在提交生成任务…");
      setElapsedSeconds(0);
      startTimeRef.current = Date.now();
      const { jobId } = await reviewGenerateEntries(pack.id, {
        targetCount           : Number(targetCount) || 50,
        modelId               : selectedModelId,
        bookId                : selectedBookId !== "none" ? selectedBookId : undefined,
        additionalInstructions: additionalInstructions || undefined
      });
      setProgressStep("任务已提交，等待模型响应…");
      await new Promise<void>((resolve, reject) => {
        pollingRef.current = setInterval(() => {
          void (async () => {
            try {
              const status: AliasPackGenerationJobStatus = await pollAliasPackGenerationJob(pack.id, jobId);
              if (status.step) setProgressStep(status.step);
              if (status.status === "done") {
                stopPolling();
                if (status.result && "candidates" in status.result) {
                  toast({ title: "预审完成", description: `共生成 ${status.result.candidates.length} 条候选，跳过 ${status.result.skipped} 条。` });
                  onReviewed(status.result);
                }
                resolve();
              } else if (status.status === "error") {
                stopPolling();
                reject(new Error(status.error ?? "生成失败"));
              }
            } catch (err) {
              stopPolling();
              reject(err instanceof Error ? err : new Error(String(err)));
            }
          })();
        }, 2000);
      });
    } catch (error) {
      toast({ title: "生成失败", description: String(error), variant: "destructive" });
    } finally {
      stopPolling();
      setGenerating(false);
      setProgressStep("");
    }
  };

  // 计时器：每秒更新 elapsedSeconds
  useEffect(() => {
    if (!generating) return;
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [generating]);

  const selectedModelName = modelOptions.find((m) => m.id === selectedModelId)?.name;
  const selectedBookTitle = bookOptions.find((b) => b.id === selectedBookId)?.title;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (generating) return; onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>模型生成候选条目</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* 生成配置：模型独占一行，目标条数与参考书籍并列 */}
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>生成模型</Label>
              <Select value={selectedModelId} onValueChange={setSelectedModelId} disabled={modelsLoading || generating}>
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? "加载中…" : modelOptions.length === 0 ? "暂无可用模型" : "选择模型"} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.length === 0 ? (
                    <SelectItem value="__no_model_available__" disabled>暂无可用模型（请在模型管理中启用并配置 Key）</SelectItem>
                  ) : modelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>{formatGenerationModelOption(model)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>目标条数</Label>
                <Input type="number" min={1} max={500} value={targetCount} disabled={generating} onChange={(e) => setTargetCount(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>参考书籍</Label>
                <Select value={selectedBookId} onValueChange={setSelectedBookId} disabled={generating}>
                  <SelectTrigger><SelectValue placeholder={booksLoading ? "加载中…" : "不指定，泛化生成"} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">不指定，仅按知识包泛化生成</SelectItem>
                    {bookOptions.map((book) => <SelectItem key={book.id} value={book.id}>{book.title}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {modelsError ? (
            <p className="text-xs text-destructive">模型列表加载失败：{modelsError}</p>
          ) : null}
          {!modelsLoading && !modelsError && modelOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              当前暂无可用模型。请前往“模型管理”页面，至少启用并配置 1 个模型后再生成。
            </p>
          ) : null}

          {/* 当前选择概述 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>知识包：<span className="font-medium text-foreground">{pack.name}</span></span>
            <span className="text-border">·</span>
            <span>模型：<span className="font-medium text-foreground">{selectedModelName ?? "未选择"}</span></span>
            <span className="text-border">·</span>
            <span>参考书籍：<span className="font-medium text-foreground">{selectedBookTitle ?? "泛化生成"}</span></span>
            <span className="text-border">·</span>
            <span>目标 {targetCount} 条</span>
          </div>

          {/* 使用说明 */}
          <p className="text-xs text-muted-foreground">
            参考书籍只参与本次提示词构造，不会把知识包绑定到书籍。补充要求临时写入提示词，适合一次性约束。
          </p>

          {/* 补充要求 */}
          <div className="space-y-1.5">
            <Label>补充要求（可选）</Label>
            <Textarea rows={3} value={additionalInstructions} disabled={generating} onChange={(e) => setAdditionalInstructions(e.target.value)} placeholder="例如：重点补齐字号、法号与官衔代称；忽略只出现一次且歧义较大的称谓。" />
          </div>

          {/* 进度展示 */}
          {generating ? (
            <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 px-4 py-5">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div className="text-center">
                <p className="text-sm font-medium">{progressStep || "生成中…"}</p>
                <p className="mt-1 text-xs text-muted-foreground">已用时 {elapsedSeconds} 秒，模型推理可能需要 1~3 分钟，请勿关闭此窗口</p>
              </div>
            </div>
          ) : null}

          {/* 操作按钮 */}
          {!generating ? (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>{previewLoading ? "预览中…" : "预览提示词"}</Button>
              <Button onClick={() => void handleGenerate()} disabled={!selectedModelId}>开始预审</Button>
            </div>
          ) : null}

          {/* 提示词预览 */}
          {preview && !generating ? (
            <div className="space-y-2 rounded-md border p-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">提示词预览</div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1">
                  <div className="text-xs font-medium">系统提示词</div>
                  <pre className="max-h-56 overflow-auto rounded bg-muted p-2.5 text-xs whitespace-pre-wrap">{preview.systemPrompt}</pre>
                </div>
                <div className="space-y-1">
                  <div className="text-xs font-medium">用户提示词</div>
                  <pre className="max-h-56 overflow-auto rounded bg-muted p-2.5 text-xs whitespace-pre-wrap">{preview.userPrompt}</pre>
                </div>
              </div>
            </div>
          ) : null}

        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GenerationReviewDialog({
  open,
  review,
  onOpenChange,
  onSave
}: {
  open        : boolean;
  review      : AliasPackGenerationReviewResult | null;
  onOpenChange: (open: boolean) => void;
  onSave      : (candidates: AliasPackGeneratedCandidate[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !review) {
      return;
    }
    setSelected(new Set(review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.canonicalName)));
  }, [open, review]);

  const selectedCandidates = useMemo(() => {
    if (!review) {
      return [];
    }
    return review.candidates.filter((candidate) => selected.has(candidate.canonicalName));
  }, [review, selected]);

  const toggleCandidate = (canonicalName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(canonicalName)) {
        next.delete(canonicalName);
      } else {
        next.add(canonicalName);
      }
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(selectedCandidates);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>审核生成结果</DialogTitle>
        </DialogHeader>
        {review ? (
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              模型：{review.model.provider} / {review.model.modelName} · 候选 {review.candidates.length} 条 · 默认选中 {selected.size} 条 · 跳过 {review.skipped} 条
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.canonicalName)))}
              >
                恢复推荐
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(review.candidates.map((candidate) => candidate.canonicalName)))}
              >
                全选
              </Button>
              <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>
                清空
              </Button>
            </div>

            <div className="max-h-115 overflow-auto rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">选择</TableHead>
                    <TableHead>标准名</TableHead>
                    <TableHead>别名</TableHead>
                    <TableHead className="w-20">置信度</TableHead>
                    <TableHead className="w-40">提示</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.candidates.map((candidate) => (
                    <TableRow key={candidate.canonicalName}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(candidate.canonicalName)}
                          onCheckedChange={() => toggleCandidate(candidate.canonicalName)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div>{candidate.canonicalName}</div>
                        {candidate.overlapEntries.length > 0 ? (
                          <div className="mt-1 text-xs text-amber-700">
                            与已有条目重叠：{candidate.overlapEntries.join("、")}
                          </div>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {candidate.aliases.map((alias) => (
                            <Badge key={`${candidate.canonicalName}-${alias}`} variant="secondary" className="text-xs">{alias}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{candidate.confidence.toFixed(2)}</TableCell>
                      <TableCell>
                        {candidate.rejectionReason ? (
                          <div className="space-y-1 text-xs text-destructive">
                            <Badge variant="destructive">默认拒绝</Badge>
                            <div>{candidate.rejectionReason}</div>
                          </div>
                        ) : candidate.overlapEntries.length > 0 ? (
                          <div className="space-y-1 text-xs text-amber-700">
                            <Badge variant="warning">需复核</Badge>
                            <div>命中重叠词：{candidate.overlapTerms.join("、")}</div>
                          </div>
                        ) : (
                          <Badge variant="success">建议保存</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消，不保存</Button>
          <Button onClick={() => void handleSave()} disabled={saving || selectedCandidates.length === 0}>
            {saving ? "保存中..." : `确认保存选中条目（${selectedCandidates.length}）`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ImportEntriesDialog({
  open,
  pack,
  onOpenChange,
  onImport
}: {
  open        : boolean;
  pack        : KnowledgePackItem;
  onOpenChange: (open: boolean) => void;
  onImport: (data: {
    entries     : Array<{ canonicalName: string; aliases: string[]; entryType?: string; notes?: string }>;
    reviewStatus: string;
  }) => Promise<void>;
}) {
  const [format, setFormat] = useState<ImportFormat>("JSON");
  const [rawContent, setRawContent] = useState("");
  const [fileName, setFileName] = useState("");
  const [reviewStatus, setReviewStatus] = useState("PENDING");
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }
    setFormat("JSON");
    setRawContent("");
    setFileName("");
    setReviewStatus("PENDING");
  }, [open]);

  const parsedPreview = useMemo(() => parseImportPreview(format, rawContent), [format, rawContent]);

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    setFileName(file.name);
    setRawContent(await file.text());
    setFormat(file.name.toLowerCase().endsWith(".csv") ? "CSV" : "JSON");
  };

  const handleSubmit = async () => {
    setImporting(true);
    try {
      await onImport({ entries: parsedPreview.entries, reviewStatus });
    } finally {
      setImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>导入知识条目</DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
            目标知识包：{pack.name}
            {fileName ? ` · 当前文件：${fileName}` : ""}
          </div>

          <div className="grid gap-2">
            <Label>导入格式</Label>
            <RadioGroup className="flex gap-6" value={format} onValueChange={(value) => setFormat(value as ImportFormat)}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="JSON" id="alias-import-json" />
                <Label htmlFor="alias-import-json">JSON</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="CSV" id="alias-import-csv" />
                <Label htmlFor="alias-import-csv">CSV</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label>上传文件或粘贴内容</Label>
            <Input type="file" accept=".json,.csv,text/csv,application/json" onChange={(event) => void handleFileChange(event)} />
            <Textarea
              rows={12}
              value={rawContent}
              onChange={(event) => setRawContent(event.target.value)}
              placeholder={format === "JSON"
                ? '{"entries":[{"canonicalName":"关羽","aliases":["关云长","云长"]}]}'
                : 'canonicalName,aliases,entryType,notes\n关羽,"关云长|云长",CHARACTER,"蜀汉五虎将"'}
            />
          </div>

          <div className="grid gap-2 rounded-md border p-3">
            <div className="text-sm font-medium">解析预览</div>
            <div className="text-sm text-muted-foreground">
              成功解析 {parsedPreview.entries.length} 条
              {parsedPreview.errors.length > 0 ? `，${parsedPreview.errors.length} 条错误` : ""}
            </div>
            {parsedPreview.entries.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {parsedPreview.entries.slice(0, 8).map((entry) => (
                  <Badge key={entry.canonicalName} variant="secondary">{entry.canonicalName}</Badge>
                ))}
                {parsedPreview.entries.length > 8 ? <Badge variant="outline">+{parsedPreview.entries.length - 8}</Badge> : null}
              </div>
            ) : null}
            {parsedPreview.errors.length > 0 ? (
              <div className="space-y-1 text-xs text-destructive">
                {parsedPreview.errors.slice(0, 6).map((error) => (
                  <div key={error} className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <span>{error}</span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>

          <div className="grid gap-2">
            <Label>导入后状态</Label>
            <RadioGroup className="grid gap-2" value={reviewStatus} onValueChange={setReviewStatus}>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="PENDING" id="alias-import-pending" />
                <Label htmlFor="alias-import-pending">待审核</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="VERIFIED" id="alias-import-verified" />
                <Label htmlFor="alias-import-verified">直接设为已验证</Label>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={importing || parsedPreview.entries.length === 0}>
            {importing ? "导入中..." : `确认导入 ${parsedPreview.entries.length} 条`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 创建知识包弹窗 */
function CreatePackDialog({
  open, onOpenChange, bookTypes, onSave
}: {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  bookTypes   : BookTypeItem[];
  onSave      : (data: { bookTypeId?: string; name: string; scope: string; description?: string }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [scope, setScope] = useState("BOOK_TYPE");
  const [bookTypeId, setBookTypeId] = useState<string>(UNLINKED_BOOK_TYPE_VALUE);
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) { setName(""); setScope("BOOK_TYPE"); setBookTypeId(UNLINKED_BOOK_TYPE_VALUE); setDescription(""); }
  }, [open]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave({
        name,
        scope,
        bookTypeId : bookTypeId === UNLINKED_BOOK_TYPE_VALUE ? undefined : bookTypeId,
        description: description || undefined
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>新建知识包</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>名称</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="如：三国演义核心人物知识库" />
          </div>
          <div className="grid gap-2">
            <Label>范围</Label>
            <Select value={scope} onValueChange={setScope}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {KNOWLEDGE_PACK_SCOPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">内部使用 BOOK_TYPE/BOOK 枚举，但前端统一显示中文说明。</div>
          </div>
          <div className="grid gap-2">
            <Label>关联书籍类型（可选）</Label>
            <Select value={bookTypeId} onValueChange={setBookTypeId}>
              <SelectTrigger><SelectValue placeholder="选择书籍类型" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={UNLINKED_BOOK_TYPE_VALUE}>不关联任何书籍类型</SelectItem>
                {bookTypes.map((bt) => (
                  <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>描述</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={!name || saving}>
            {saving ? "创建中..." : "创建"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditPackDialog({
  open,
  onOpenChange,
  pack,
  onSave
}: {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  pack        : KnowledgePackItem | null;
  onSave      : (data: { id: string; name: string; description: string | null; isActive: boolean }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !pack) {
      return;
    }

    setName(pack.name);
    setDescription(pack.description ?? "");
    setIsActive(pack.isActive);
  }, [open, pack]);

  const handleSubmit = async () => {
    if (!pack) {
      return;
    }

    setSaving(true);
    try {
      await onSave({
        id         : pack.id,
        name       : name.trim(),
        description: description.trim() ? description.trim() : null,
        isActive
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>编辑知识包</DialogTitle></DialogHeader>
        {pack ? (
          <div className="grid gap-4 py-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              范围：{getKnowledgePackScopeLabel(pack.scope)} · 关联题材：{pack.bookType?.name ?? "未关联"} · 当前版本：v{pack.version}
            </div>
            <div className="grid gap-2">
              <Label>名称</Label>
              <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="知识包名称" />
            </div>
            <div className="grid gap-2">
              <Label>描述</Label>
              <Textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={3} />
            </div>
            <div className="flex items-center gap-2 rounded-md border p-3">
              <Checkbox id="knowledge-pack-active" checked={isActive} onCheckedChange={(checked) => setIsActive(Boolean(checked))} />
              <Label htmlFor="knowledge-pack-active">启用知识包（停用后不参与运行时加载）</Label>
            </div>
          </div>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={!pack || !name.trim() || saving}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** 创建条目弹窗 */
function CreateEntryDialog({
  open, onOpenChange, onSave
}: {
  open        : boolean;
  onOpenChange: (open: boolean) => void;
  onSave      : (data: { canonicalName: string; aliases: string[]; entryType?: string; notes?: string }) => Promise<void>;
}) {
  const [canonicalName, setCanonicalName] = useState("");
  const [aliases, setAliases] = useState<string[]>([]);
  const [entryType, setEntryType] = useState<EntryTypeValue>("CHARACTER");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setCanonicalName("");
      setAliases([]);
      setEntryType("CHARACTER");
      setNotes("");
    }
  }, [open]);

  const handleSubmit = async () => {
    setSaving(true);
    try {
      await onSave({
        canonicalName,
        aliases: normalizeAliasValues(aliases.filter((alias) => alias !== canonicalName.trim())),
        entryType,
        notes  : notes || undefined
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader><DialogTitle>添加知识条目</DialogTitle></DialogHeader>
        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>标准名（canonicalName）</Label>
            <Input value={canonicalName} onChange={(e) => setCanonicalName(e.target.value)} placeholder="如：关羽" />
          </div>
          <div className="grid gap-2">
            <Label>条目类型</Label>
            <Select value={entryType} onValueChange={(value) => setEntryType(value as EntryTypeValue)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                  {KNOWLEDGE_ENTRY_TYPE_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>别名</Label>
            <AliasChipsInput
              values={aliases}
              onChange={setAliases}
              placeholder="输入别名后按 Enter、逗号或失焦添加"
            />
          </div>
          <div className="grid gap-2">
            <Label>备注</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={!canonicalName || saving}>
            {saving ? "添加中..." : "添加"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
