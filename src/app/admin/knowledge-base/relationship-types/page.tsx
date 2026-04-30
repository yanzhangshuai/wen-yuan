"use client";

import { useEffect, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import {
  Check,
  CheckCircle2,
  Clock3,
  Database,
  PauseCircle,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
  X
} from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/dialog";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle
} from "@/components/ui/sheet";
import { toast } from "@/components/ui/sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { fetchModels, type AdminModelItem } from "@/lib/services/models";
import {
  batchRelationshipTypeAction,
  createRelationshipType,
  deleteRelationshipType,
  fetchRelationshipTypes,
  initializeCommonRelationshipTypes,
  pollRelationshipTypeGenerationJob,
  previewRelationshipTypeGenerationPrompt,
  RELATIONSHIP_DIRECTION_MODES,
  RELATIONSHIP_TYPE_GROUPS,
  RELATIONSHIP_TYPE_STATUSES,
  reviewGeneratedRelationshipTypes,
  updateRelationshipType,
  type GeneratedRelationshipTypeCandidate,
  type RelationshipDirectionMode,
  type RelationshipTypeGroup,
  type RelationshipTypeItem,
  type RelationshipTypePayload,
  type RelationshipTypeStatus
} from "@/lib/services/relationship-types";

const ALL_VALUE = "__ALL__";

const directionLabels: Record<RelationshipDirectionMode, string> = {
  SYMMETRIC: "对称",
  INVERSE  : "互逆",
  DIRECTED : "单向"
};

const statusLabels: Record<RelationshipTypeStatus, string> = {
  ACTIVE        : "启用",
  INACTIVE      : "停用",
  PENDING_REVIEW: "待审核"
};

const statusBadgeVariants: Record<RelationshipTypeStatus, "success" | "secondary" | "warning"> = {
  ACTIVE        : "success",
  INACTIVE      : "secondary",
  PENDING_REVIEW: "warning"
};

interface RelationshipTypeFormState {
  id?             : string;
  name            : string;
  group           : RelationshipTypeGroup;
  directionMode   : RelationshipDirectionMode;
  sourceRoleLabel : string;
  targetRoleLabel : string;
  edgeLabel       : string;
  reverseEdgeLabel: string;
  aliasesText     : string;
  description     : string;
  usageNotes      : string;
  examplesText    : string;
  color           : string;
  sortOrder       : number;
  status          : RelationshipTypeStatus;
}

function emptyForm(): RelationshipTypeFormState {
  return {
    name            : "",
    group           : "血缘",
    directionMode   : "INVERSE",
    sourceRoleLabel : "",
    targetRoleLabel : "",
    edgeLabel       : "",
    reverseEdgeLabel: "",
    aliasesText     : "",
    description     : "",
    usageNotes      : "",
    examplesText    : "",
    color           : "",
    sortOrder       : 0,
    status          : "ACTIVE"
  };
}

function splitList(value: string): string[] {
  return value.split(/[,，\n]/).map((item) => item.trim()).filter(Boolean);
}

function itemToForm(item: RelationshipTypeItem): RelationshipTypeFormState {
  return {
    id              : item.id,
    name            : item.name,
    group           : item.group,
    directionMode   : item.directionMode,
    sourceRoleLabel : item.sourceRoleLabel ?? "",
    targetRoleLabel : item.targetRoleLabel ?? "",
    edgeLabel       : item.edgeLabel,
    reverseEdgeLabel: item.reverseEdgeLabel ?? "",
    aliasesText     : item.aliases.join("，"),
    description     : item.description ?? "",
    usageNotes      : item.usageNotes ?? "",
    examplesText    : item.examples.join("，"),
    color           : item.color ?? "",
    sortOrder       : item.sortOrder,
    status          : item.status
  };
}

function formToPayload(form: RelationshipTypeFormState): RelationshipTypePayload {
  return {
    name            : form.name.trim(),
    group           : form.group,
    directionMode   : form.directionMode,
    sourceRoleLabel : form.sourceRoleLabel.trim() || null,
    targetRoleLabel : form.targetRoleLabel.trim() || null,
    edgeLabel       : form.edgeLabel.trim() || form.name.trim(),
    reverseEdgeLabel: form.reverseEdgeLabel.trim() || null,
    aliases         : splitList(form.aliasesText),
    description     : form.description.trim() || null,
    usageNotes      : form.usageNotes.trim() || null,
    examples        : splitList(form.examplesText),
    color           : form.color.trim() || null,
    sortOrder       : form.sortOrder,
    status          : form.status
  };
}

function previewLabels(form: RelationshipTypeFormState | RelationshipTypeItem | RelationshipTypePayload) {
  const edgeLabel = form.edgeLabel?.trim() || form.name.trim() || "关系";
  if (form.directionMode === "SYMMETRIC") {
    return { aToB: edgeLabel, bToA: edgeLabel, edge: edgeLabel };
  }
  return {
    aToB: form.targetRoleLabel?.trim() || edgeLabel,
    bToA: form.sourceRoleLabel?.trim() || form.reverseEdgeLabel?.trim() || edgeLabel,
    edge: edgeLabel
  };
}

export default function RelationshipTypesPage() {
  const [items, setItems] = useState<RelationshipTypeItem[]>([]);
  const [models, setModels] = useState<AdminModelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [q, setQ] = useState("");
  const [group, setGroup] = useState(ALL_VALUE);
  const [directionMode, setDirectionMode] = useState(ALL_VALUE);
  const [status, setStatus] = useState(ALL_VALUE);
  const [form, setForm] = useState<RelationshipTypeFormState>(() => emptyForm());
  const [sheetOpen, setSheetOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [targetCount, setTargetCount] = useState(30);
  const [targetGroup, setTargetGroup] = useState(ALL_VALUE);
  const [modelId, setModelId] = useState(ALL_VALUE);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [promptPreview, setPromptPreview] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<GeneratedRelationshipTypeCandidate[]>([]);
  const [skippedExistingCandidates, setSkippedExistingCandidates] = useState(0);
  const [selectedCandidateKeys, setSelectedCandidateKeys] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);
  const [initializeCommonOpen, setInitializeCommonOpen] = useState(false);
  const [initializingCommon, setInitializingCommon] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RelationshipTypeItem | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchDeleting, setBatchDeleting] = useState(false);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchGroupOpen, setBatchGroupOpen] = useState(false);
  const [batchGroup, setBatchGroup] = useState<RelationshipTypeGroup>("血缘");
  const [batchPending, setBatchPending] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await fetchRelationshipTypes({
        q            : q.trim() || undefined,
        group        : group === ALL_VALUE ? undefined : group,
        directionMode: directionMode === ALL_VALUE ? undefined : directionMode,
        status       : status === ALL_VALUE ? undefined : status
      });
      setItems(data);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "关系类型列表获取失败");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    void fetchModels().then((data) => setModels(data.filter((item) => item.isEnabled))).catch(() => setModels([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const activeModels = useMemo(() => models.filter((item) => item.isEnabled), [models]);
  const currentPreview = previewLabels(form);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  async function handleSearch() {
    await load();
  }

  function openCreateSheet() {
    setForm(emptyForm());
    setSheetOpen(true);
  }

  function openEditSheet(item: RelationshipTypeItem) {
    setForm(itemToForm(item));
    setSheetOpen(true);
  }

  async function handleSubmit() {
    const payload = formToPayload(form);
    if (!payload.name) {
      toast.error("关系名称不能为空");
      return;
    }

    setSaving(true);
    try {
      if (form.id) {
        await updateRelationshipType(form.id, payload);
        toast.success("关系类型已更新");
      } else {
        await createRelationshipType(payload);
        toast.success("关系类型已创建");
      }
      setForm(emptyForm());
      setSheetOpen(false);
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "保存失败");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(item: RelationshipTypeItem) {
    setDeleting(true);
    try {
      await deleteRelationshipType(item.id);
      toast.success("关系类型已删除");
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      await load();
      setDeleteTarget(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      setDeleting(false);
    }
  }

  function toggleSelect(id: string) {
    setSelected((previous) => {
      const next = new Set(previous);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((previous) => {
      if (items.length === 0 || previous.size === items.length) {
        return new Set();
      }
      return new Set(items.map((item) => item.id));
    });
  }

  async function runBatchAction(
    body: Parameters<typeof batchRelationshipTypeAction>[0],
    successMessage: string
  ): Promise<boolean> {
    setBatchPending(true);
    try {
      const result = await batchRelationshipTypeAction(body);
      toast.success(`${successMessage}，已处理 ${result.count} 条`);
      setSelected(new Set());
      await load();
      return true;
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "批量操作失败");
      return false;
    } finally {
      setBatchPending(false);
    }
  }

  async function handleBatchDelete() {
    setBatchDeleting(true);
    try {
      const ok = await runBatchAction({ action: "delete", ids: selectedIds }, "已批量删除");
      if (ok) setBatchDeleteOpen(false);
    } finally {
      setBatchDeleting(false);
    }
  }

  async function handleBatchChangeGroup() {
    const ok = await runBatchAction({ action: "changeGroup", ids: selectedIds, group: batchGroup }, "已修改分组");
    if (ok) setBatchGroupOpen(false);
  }

  async function handleInitializeCommon() {
    setInitializingCommon(true);
    try {
      const result = await initializeCommonRelationshipTypes();
      toast.success(`初始化完成：新增 ${result.created} 条，跳过 ${result.skipped} 条`);
      await load();
      setInitializeCommonOpen(false);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "常用关系类型初始化失败");
    } finally {
      setInitializingCommon(false);
    }
  }

  function handleConfirmInitializeCommon(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!initializingCommon) {
      void handleInitializeCommon();
    }
  }

  function handleConfirmDelete(event: MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (deleteTarget && !deleting) {
      void handleDelete(deleteTarget);
    }
  }

  async function handlePreviewPrompt() {
    try {
      const preview = await previewRelationshipTypeGenerationPrompt({
        targetCount,
        targetGroup           : targetGroup === ALL_VALUE ? undefined : targetGroup,
        additionalInstructions: additionalInstructions.trim() || undefined
      });
      setPromptPreview([preview.systemPrompt, preview.userPrompt].join("\n\n---\n\n"));
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "提示词预览失败");
    }
  }

  async function handleGenerate() {
    setGenerating(true);
    setPromptPreview(null);
    setCandidates([]);
    setSkippedExistingCandidates(0);
    setSelectedCandidateKeys(new Set());
    try {
      const { jobId } = await reviewGeneratedRelationshipTypes({
        targetCount,
        targetGroup           : targetGroup === ALL_VALUE ? undefined : targetGroup,
        additionalInstructions: additionalInstructions.trim() || undefined,
        modelId               : modelId === ALL_VALUE ? undefined : modelId
      });

      for (let attempt = 0; attempt < 120; attempt += 1) {
        const job = await pollRelationshipTypeGenerationJob(jobId);
        if (job.status === "done" && job.result) {
          setCandidates(job.result.candidates);
          setSkippedExistingCandidates(job.result.skippedExisting);
          setSelectedCandidateKeys(new Set(job.result.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.name)));
          toast.success(`候选关系类型生成完成，已过滤已有 ${job.result.skippedExisting} 条`);
          return;
        }
        if (job.status === "error") {
          throw new Error(job.error ?? "生成失败");
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
      }
      throw new Error("生成任务超时");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "生成失败");
    } finally {
      setGenerating(false);
    }
  }

  async function handleSaveCandidates() {
    const selectedCandidates = candidates.filter((candidate) => selectedCandidateKeys.has(candidate.name));
    if (selectedCandidates.length === 0) {
      toast.error("请先选择要保存的候选");
      return;
    }

    setSaving(true);
    try {
      for (const candidate of selectedCandidates) {
        await createRelationshipType({
          ...candidate,
          status: "PENDING_REVIEW"
        });
      }
      toast.success(`已保存 ${selectedCandidates.length} 条候选为待审核`);
      setCandidates([]);
      setSkippedExistingCandidates(0);
      setSelectedCandidateKeys(new Set());
      await load();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "候选保存失败");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageContainer fullWidth className="relationship-types-page">
      <PageHeader
        title="关系类型知识库"
        description="管理父子、岳婿、师生、主仆等稳定结构关系；行为和态度进入关系档案事件。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "关系类型" }
        ]}
      >
        <AlertDialog open={initializeCommonOpen} onOpenChange={(open) => {
          if (!initializingCommon) setInitializeCommonOpen(open);
        }}>
          <AlertDialogTrigger asChild>
            <Button type="button" variant="outline" size="sm" disabled={initializingCommon}>
              <Database className="h-4 w-4" />
              {initializingCommon ? "初始化中..." : "初始化常用"}
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>确认初始化常用关系类型？</AlertDialogTitle>
              <AlertDialogDescription>
                系统会跳过已有同名或别名冲突的数据，不会覆盖现有关系类型。
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={initializingCommon}>取消</AlertDialogCancel>
              <AlertDialogAction onClick={handleConfirmInitializeCommon} disabled={initializingCommon}>
                {initializingCommon ? "初始化中..." : "确认初始化"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        <Button type="button" variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
          <Sparkles className="h-4 w-4" />
          模型生成
        </Button>
        <Button type="button" size="sm" onClick={openCreateSheet}>
          <Plus className="h-4 w-4" />
          新建关系类型
        </Button>
      </PageHeader>

      <PageSection>
        <div className="mb-4 grid gap-3 lg:grid-cols-[minmax(260px,1fr)_170px_170px_170px_auto]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              className="pl-9"
              value={q}
              onChange={(event) => setQ(event.target.value)}
              placeholder="搜索名称、code、别名、说明"
            />
          </div>
          <FilterSelect label="分组" value={group} values={[ALL_VALUE, ...RELATIONSHIP_TYPE_GROUPS]} getLabel={(value) => value === ALL_VALUE ? "全部分组" : value} onValueChange={setGroup} />
          <FilterSelect label="方向" value={directionMode} values={[ALL_VALUE, ...RELATIONSHIP_DIRECTION_MODES]} getLabel={(value) => value === ALL_VALUE ? "全部方向" : directionLabels[value as RelationshipDirectionMode]} onValueChange={setDirectionMode} />
          <FilterSelect label="状态" value={status} values={[ALL_VALUE, ...RELATIONSHIP_TYPE_STATUSES]} getLabel={(value) => value === ALL_VALUE ? "全部状态" : statusLabels[value as RelationshipTypeStatus]} onValueChange={setStatus} />
          <Button type="button" variant="outline" onClick={() => void handleSearch()}>
            <RefreshCw className="h-4 w-4" />
            查询
          </Button>
        </div>

        <BatchRelationshipTypeToolbar
          selectedCount={selected.size}
          disabled={batchPending || batchDeleting}
          onEnable={() => void runBatchAction({ action: "enable", ids: selectedIds }, "已批量启用")}
          onDisable={() => void runBatchAction({ action: "disable", ids: selectedIds }, "已批量停用")}
          onMarkPendingReview={() => void runBatchAction({ action: "markPendingReview", ids: selectedIds }, "已设为待审核")}
          onChangeGroup={() => setBatchGroupOpen(true)}
          onDelete={() => setBatchDeleteOpen(true)}
          onClear={() => setSelected(new Set())}
        />

        <div className="overflow-hidden rounded-md border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10">
                  <Checkbox
                    checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                    aria-label="全选关系类型"
                    onCheckedChange={toggleSelectAll}
                  />
                </TableHead>
                <TableHead className="min-w-64">关系类型</TableHead>
                <TableHead className="w-48">分组 / 方向</TableHead>
                <TableHead className="min-w-64">称谓与边</TableHead>
                <TableHead className="w-24">引用</TableHead>
                <TableHead className="w-28">状态</TableHead>
                <TableHead className="w-24 text-right">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>加载中...</TableCell>
                </TableRow>
              ) : items.length === 0 ? (
                <TableRow>
                  <TableCell className="py-10 text-center text-muted-foreground" colSpan={7}>暂无关系类型</TableCell>
                </TableRow>
              ) : items.map((item) => {
                const labels = previewLabels(item);
                return (
                  <TableRow key={item.id}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(item.id)}
                        aria-label={`选择关系类型 ${item.name}`}
                        onCheckedChange={() => toggleSelect(item.id)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{item.name}</div>
                      <div className="mt-0.5 font-mono text-xs text-muted-foreground">{item.code}</div>
                      {item.aliases.length > 0 ? (
                        <div className="mt-1 line-clamp-1 text-xs text-muted-foreground">{item.aliases.join("、")}</div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        <Badge variant="outline">{item.group}</Badge>
                        <Badge variant="secondary">{directionLabels[item.directionMode]}</Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      <div>A 对 B：{labels.aToB}</div>
                      <div>B 对 A：{labels.bToA}</div>
                      <div>图谱边：{labels.edge}</div>
                    </TableCell>
                    <TableCell>{item._count?.relationships ?? 0}</TableCell>
                    <TableCell>
                      <Badge variant={statusBadgeVariants[item.status]}>{statusLabels[item.status]}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`编辑关系类型 ${item.name}`} onClick={() => openEditSheet(item)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button type="button" variant="ghost" size="icon-sm" aria-label={`删除关系类型 ${item.name}`} onClick={() => setDeleteTarget(item)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      </PageSection>

      <Sheet open={sheetOpen} onOpenChange={(open) => {
        if (!saving) setSheetOpen(open);
      }}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{form.id ? "编辑关系类型" : "新建关系类型"}</SheetTitle>
            <SheetDescription>维护标准名称、方向规则、归一化别名与审核状态。</SheetDescription>
          </SheetHeader>
          <div className="grid gap-4 px-4 pb-4">
            <RelationshipTypeForm form={form} preview={currentPreview} onChange={setForm} />
          </div>
          <SheetFooter className="border-t">
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setSheetOpen(false)} disabled={saving}>取消</Button>
              <Button type="button" onClick={() => void handleSubmit()} disabled={saving}>{saving ? "保存中..." : "保存"}</Button>
            </div>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      <Dialog open={generateDialogOpen} onOpenChange={(open) => {
        if (!generating && !saving) setGenerateDialogOpen(open);
      }}>
        <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-4xl">
          <DialogHeader>
            <DialogTitle>模型生成关系类型候选</DialogTitle>
            <DialogDescription>
              生成结果只作为候选预审，保存后进入待审核状态，不会直接启用。
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4">
            <div className="grid gap-3 lg:grid-cols-[160px_180px_minmax(180px,1fr)_auto]">
              <Field label="目标条数" id="target-count">
                <Input id="target-count" type="number" min={1} max={100} value={targetCount} onChange={(event) => setTargetCount(Number(event.target.value))} />
              </Field>
              <FilterSelect label="目标分组" value={targetGroup} values={[ALL_VALUE, ...RELATIONSHIP_TYPE_GROUPS]} getLabel={(value) => value === ALL_VALUE ? "不限分组" : value} onValueChange={setTargetGroup} />
              <FilterSelect label="生成模型" value={modelId} values={[ALL_VALUE, ...activeModels.map((item) => item.id)]} getLabel={(value) => value === ALL_VALUE ? "使用默认模型" : activeModels.find((item) => item.id === value)?.name ?? value} onValueChange={setModelId} />
              <div className="flex items-end gap-2">
                <Button type="button" variant="outline" onClick={() => void handlePreviewPrompt()}>预览提示词</Button>
                <Button type="button" onClick={() => void handleGenerate()} disabled={generating}>{generating ? "生成中..." : "开始预审"}</Button>
              </div>
            </div>
            <Field label="补充要求" id="additional-instructions">
              <Textarea id="additional-instructions" value={additionalInstructions} onChange={(event) => setAdditionalInstructions(event.target.value)} placeholder="例如：优先补充明清小说常见亲属和官场关系" />
            </Field>
            {promptPreview ? <pre className="max-h-72 overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">{promptPreview}</pre> : null}
            {candidates.length > 0 ? (
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <div>
                    <h2 className="font-medium">候选结果</h2>
                    {skippedExistingCandidates > 0 ? (
                      <p className="mt-1 text-sm text-muted-foreground">已过滤当前知识库已有关系类型 {skippedExistingCandidates} 条。</p>
                    ) : null}
                  </div>
                  <Button type="button" size="sm" onClick={() => void handleSaveCandidates()} disabled={saving}>
                    <Check className="h-4 w-4" />
                    保存选中为待审核
                  </Button>
                </div>
                <div className="grid gap-2">
                  {candidates.map((candidate) => {
                    const preview = previewLabels(candidate);
                    const selectedCandidate = selectedCandidateKeys.has(candidate.name);
                    return (
                      <div key={candidate.name} className="flex gap-3 rounded-md border p-3 text-sm">
                        <Checkbox
                          checked={selectedCandidate}
                          aria-label={`选择候选关系类型 ${candidate.name}`}
                          onCheckedChange={(checked) => {
                            const next = new Set(selectedCandidateKeys);
                            if (checked) next.add(candidate.name);
                            else next.delete(candidate.name);
                            setSelectedCandidateKeys(next);
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{candidate.name}</span>
                            <Badge variant="outline">{candidate.group}</Badge>
                            <Badge variant="secondary">{directionLabels[candidate.directionMode]}</Badge>
                            {candidate.rejectionReason ? <span className="text-destructive">{candidate.rejectionReason}</span> : null}
                          </div>
                          <div className="mt-1 text-muted-foreground">
                            A 对 B：{preview.aToB}；B 对 A：{preview.bToA}；图谱边：{preview.edge}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : skippedExistingCandidates > 0 ? (
              <div className="rounded-md border bg-muted/40 p-3 text-sm text-muted-foreground">
                模型返回的候选已全部被过滤，其中已有关系类型 {skippedExistingCandidates} 条。可调整目标分组或补充要求后重新生成。
              </div>
            ) : null}
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setGenerateDialogOpen(false)} disabled={generating || saving}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={batchGroupOpen} onOpenChange={(open) => {
        if (!batchPending) setBatchGroupOpen(open);
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>修改所选关系类型分组</DialogTitle>
          </DialogHeader>
          <FilterSelect
            label="目标分组"
            value={batchGroup}
            values={[...RELATIONSHIP_TYPE_GROUPS]}
            getLabel={(value) => value}
            onValueChange={(value) => setBatchGroup(value as RelationshipTypeGroup)}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setBatchGroupOpen(false)} disabled={batchPending}>取消</Button>
            <Button type="button" onClick={() => void handleBatchChangeGroup()} disabled={batchPending || selectedIds.length === 0}>
              {batchPending ? "修改中..." : "确认修改"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={batchDeleteOpen} onOpenChange={(open) => {
        if (!batchDeleting) setBatchDeleteOpen(open);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除所选关系类型？</AlertDialogTitle>
            <AlertDialogDescription>
              将删除当前选中的 {selectedIds.length} 个关系类型。已被引用的类型会被后端拒绝删除，可改为批量停用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={batchDeleting || selectedIds.length === 0}
              onClick={(event) => {
                event.preventDefault();
                void handleBatchDelete();
              }}
            >
              {batchDeleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteTarget !== null} onOpenChange={(open) => {
        if (!open && !deleting) setDeleteTarget(null);
      }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除“{deleteTarget?.name}”？</AlertDialogTitle>
            <AlertDialogDescription>
              已被引用的类型会被后端拒绝删除，可先停用以保留历史关系引用。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={handleConfirmDelete}
            >
              {deleting ? "删除中..." : "确认删除"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

interface BatchRelationshipTypeToolbarProps {
  selectedCount      : number;
  disabled           : boolean;
  onEnable           : () => void;
  onDisable          : () => void;
  onMarkPendingReview: () => void;
  onChangeGroup      : () => void;
  onDelete           : () => void;
  onClear            : () => void;
}

function BatchRelationshipTypeToolbar({
  selectedCount,
  disabled,
  onEnable,
  onDisable,
  onMarkPendingReview,
  onChangeGroup,
  onDelete,
  onClear
}: BatchRelationshipTypeToolbarProps) {
  if (selectedCount === 0) {
    return null;
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/30 p-3">
      <div className="text-sm font-medium">已选择 {selectedCount} 个关系类型</div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onEnable}>
          <CheckCircle2 className="h-4 w-4" />
          启用
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onDisable}>
          <PauseCircle className="h-4 w-4" />
          停用
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onMarkPendingReview}>
          <Clock3 className="h-4 w-4" />
          设为待审核
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={onChangeGroup}>
          修改分组
        </Button>
        <Button type="button" variant="destructive" size="sm" disabled={disabled} onClick={onDelete}>
          <Trash2 className="h-4 w-4" />
          删除
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={disabled} onClick={onClear}>
          <X className="h-4 w-4" />
          清空选择
        </Button>
      </div>
    </div>
  );
}

interface RelationshipTypeFormProps {
  form    : RelationshipTypeFormState;
  preview : ReturnType<typeof previewLabels>;
  onChange: (form: RelationshipTypeFormState) => void;
}

function RelationshipTypeForm({ form, preview, onChange }: RelationshipTypeFormProps) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="关系名称" id="name">
          <Input id="name" value={form.name} onChange={(event) => onChange({ ...form, name: event.target.value })} placeholder="岳婿" />
        </Field>
        <FilterSelect label="分组" value={form.group} values={[...RELATIONSHIP_TYPE_GROUPS]} getLabel={(value) => value} onValueChange={(value) => onChange({ ...form, group: value as RelationshipTypeGroup })} />
      </div>
      <FilterSelect label="方向模式" value={form.directionMode} values={[...RELATIONSHIP_DIRECTION_MODES]} getLabel={(value) => directionLabels[value as RelationshipDirectionMode]} onValueChange={(value) => onChange({ ...form, directionMode: value as RelationshipDirectionMode })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="source 称谓" id="sourceRoleLabel">
          <Input id="sourceRoleLabel" value={form.sourceRoleLabel} onChange={(event) => onChange({ ...form, sourceRoleLabel: event.target.value })} placeholder="岳父" />
        </Field>
        <Field label="target 称谓" id="targetRoleLabel">
          <Input id="targetRoleLabel" value={form.targetRoleLabel} onChange={(event) => onChange({ ...form, targetRoleLabel: event.target.value })} placeholder="女婿" />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="图谱边标签" id="edgeLabel">
          <Input id="edgeLabel" value={form.edgeLabel} onChange={(event) => onChange({ ...form, edgeLabel: event.target.value })} placeholder="默认使用关系名称" />
        </Field>
        <Field label="反向边标签" id="reverseEdgeLabel">
          <Input id="reverseEdgeLabel" value={form.reverseEdgeLabel} onChange={(event) => onChange({ ...form, reverseEdgeLabel: event.target.value })} />
        </Field>
      </div>
      <Field label="别名/同义词" id="aliasesText">
        <Textarea id="aliasesText" value={form.aliasesText} onChange={(event) => onChange({ ...form, aliasesText: event.target.value })} placeholder="用逗号或换行分隔" />
      </Field>
      <Field label="定义说明" id="description">
        <Textarea id="description" value={form.description} onChange={(event) => onChange({ ...form, description: event.target.value })} />
      </Field>
      <Field label="使用边界" id="usageNotes">
        <Textarea id="usageNotes" value={form.usageNotes} onChange={(event) => onChange({ ...form, usageNotes: event.target.value })} placeholder="说明不要与行为/态度标签混淆" />
      </Field>
      <Field label="例子" id="examplesText">
        <Textarea id="examplesText" value={form.examplesText} onChange={(event) => onChange({ ...form, examplesText: event.target.value })} placeholder="胡屠户与范进" />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="图谱颜色" id="color">
          <Input id="color" value={form.color} onChange={(event) => onChange({ ...form, color: event.target.value })} placeholder="#8b5cf6 或 CSS 变量" />
        </Field>
        <Field label="排序" id="sortOrder">
          <Input id="sortOrder" type="number" value={form.sortOrder} onChange={(event) => onChange({ ...form, sortOrder: Number(event.target.value) })} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FilterSelect label="状态" value={form.status} values={[...RELATIONSHIP_TYPE_STATUSES]} getLabel={(value) => statusLabels[value as RelationshipTypeStatus]} onValueChange={(value) => onChange({ ...form, status: value as RelationshipTypeStatus })} />
      </div>
      <div className="rounded-md bg-muted p-3 text-sm">
        <div className="font-medium">反向预览</div>
        <div className="mt-1 text-muted-foreground">A 对 B：{preview.aToB}；B 对 A：{preview.bToA}；图谱边：{preview.edge}</div>
      </div>
    </>
  );
}

interface FieldProps {
  label   : string;
  id      : string;
  children: ReactNode;
}

function Field({ label, id, children }: FieldProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

interface FilterSelectProps {
  label        : string;
  value        : string;
  values       : string[];
  getLabel     : (value: string) => string;
  onValueChange: (value: string) => void;
}

function FilterSelect({ label, value, values, getLabel, onValueChange }: FilterSelectProps) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((item) => (
            <SelectItem key={item} value={item}>{getLabel(item)}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
