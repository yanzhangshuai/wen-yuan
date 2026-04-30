"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, Sparkles, Trash2, Upload, WandSparkles } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
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
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAdminModels } from "@/hooks/use-admin-models";
import { BatchActionControls } from "@/app/admin/knowledge-base/batch-action-controls";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  batchSurnameAction,
  createSurname,
  deleteSurname,
  fetchSurnames,
  importSurnames,
  previewSurnameGenerationPrompt,
  reviewGeneratedSurnames,
  pollSurnameGenerationJob,
  testSurnameExtraction,
  type GeneratedSurnameCandidate,
  type SurnameGenerationPreview,
  type SurnameGenerationReviewResult,
  type SurnameItem,
  type SurnameTestResult,
  updateSurname
} from "@/lib/services/surnames";

type CompoundFilter = "all" | "single" | "compound";

const NO_REFERENCE_BOOK_TYPE = "all";

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

function surnameMatchTypeLabel(matchType: string): string {
  switch (matchType) {
    case "compound":
      return "复姓命中";
    case "single":
      return "单姓命中";
    case "not_found":
      return "未命中";
    default:
      return matchType;
  }
}

export default function SurnamesPage() {
  const [items, setItems] = useState<SurnameItem[]>([]);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [compoundFilter, setCompoundFilter] = useState<CompoundFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<SurnameItem | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [generationReview, setGenerationReview] = useState<SurnameGenerationReviewResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<SurnameItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importText, setImportText] = useState("");
  const [testName, setTestName] = useState("");
  const [testResult, setTestResult] = useState<SurnameTestResult | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [surnameItems, bookTypeItems] = await Promise.all([
        fetchSurnames({
          q       : query || undefined,
          compound: compoundFilter === "all"
            ? undefined
            : compoundFilter === "compound"
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(surnameItems);
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [compoundFilter, query, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const compoundSummary = useMemo(() => {
    const compoundCount = items.filter((item) => item.isCompound).length;
    return {
      total   : items.length,
      compound: compoundCount,
      single  : items.length - compoundCount
    };
  }, [items]);

  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

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
    action: Parameters<typeof batchSurnameAction>[0],
    successTitle: string
  ) {
    try {
      const result = await batchSurnameAction(action);
      toast({
        title      : successTitle,
        description: `已处理 ${result.count} 条姓氏。`
      });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
      throw error;
    }
  }

  async function handleDeleteConfirmed(item: SurnameItem) {
    setDeletePending(true);
    try {
      await deleteSurname(item.id);
      toast({ title: "删除成功" });
      setDeleteTarget(null);
      setSelected((previous) => {
        const next = new Set(previous);
        next.delete(item.id);
        return next;
      });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    } finally {
      setDeletePending(false);
    }
  }

  async function handleImport() {
    if (!importText.trim()) return;
    try {
      const result = await importSurnames(importText);
      toast({
        title      : "导入完成",
        description: `共解析 ${result.total} 条，新增 ${result.created} 条，跳过 ${result.skipped} 条。`
      });
      setImportOpen(false);
      setImportText("");
      await load();
    } catch (error) {
      toast({ title: "导入失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleTest() {
    if (!testName.trim()) return;
    try {
      const result = await testSurnameExtraction(testName.trim());
      setTestResult(result);
    } catch (error) {
      toast({ title: "测试失败", description: String(error), variant: "destructive" });
    }
  }

  function handleGenerationReviewed(review: SurnameGenerationReviewResult) {
    setGenerationReview(review);
    setGenerateDialogOpen(false);
    setReviewDialogOpen(true);
  }

  async function handleSaveReviewedCandidates(candidates: GeneratedSurnameCandidate[]) {
    const settled = await Promise.allSettled(
      candidates.map((candidate) => createSurname({
        surname    : candidate.surname,
        isCompound : candidate.isCompound,
        priority   : candidate.priority,
        description: candidate.description ?? undefined,
        source     : "LLM_SUGGESTED"
      }))
    );

    const successCount = settled.filter((result) => result.status === "fulfilled").length;
    const failureCount = settled.length - successCount;
    if (successCount === 0 && failureCount > 0) {
      const firstFailure = settled.find((result) => result.status === "rejected");
      toast({
        title      : "保存失败",
        description: firstFailure?.status === "rejected" ? String(firstFailure.reason) : "未能保存任何候选",
        variant    : "destructive"
      });
      return;
    }

    toast({
      title      : failureCount > 0 ? "部分候选已保存" : "生成结果已保存",
      description: `成功 ${successCount} 条${failureCount > 0 ? `，失败 ${failureCount} 条` : ""}。`
    });
    setReviewDialogOpen(false);
    setGenerationReview(null);
    await load();
  }

  return (
    <PageContainer>
      <PageHeader
        title="姓氏词库"
        description="维护运行时姓氏识别词表，优先覆盖复姓与特定书籍类型下的高频姓氏。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "姓氏词库" }
        ]}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" />
            模型生成
          </Button>
          <Button variant="outline" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="mr-1 h-4 w-4" />
            批量导入
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增姓氏
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <PageSection>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索姓氏" />
            </div>
            <Select value={compoundFilter} onValueChange={(value) => setCompoundFilter(value as CompoundFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="single">仅单姓</SelectItem>
                <SelectItem value="compound">仅复姓</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()}>刷新</Button>
          </div>

          <div className="mb-4 flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span>总计 {compoundSummary.total} 条</span>
            <span>复姓 {compoundSummary.compound} 条</span>
            <span>单姓 {compoundSummary.single} 条</span>
          </div>

          <BatchActionControls
            selectedCount={selected.size}
            bookTypes={bookTypes.map((bookType) => ({ id: bookType.id, name: bookType.name }))}
            onEnable={() => runBatchAction({ action: "enable", ids: selectedIds }, "已批量启用")}
            onDisable={() => runBatchAction({ action: "disable", ids: selectedIds }, "已批量停用")}
            onDelete={() => runBatchAction({ action: "delete", ids: selectedIds }, "已批量删除")}
            onClear={() => setSelected(new Set())}
            onChangeBookType={(bookTypeId) => runBatchAction(
              { action: "changeBookType", ids: selectedIds, bookTypeId },
              "已更新书籍类型"
            )}
          />

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <Checkbox
                        checked={allSelected ? true : partiallySelected ? "indeterminate" : false}
                        aria-label="全选姓氏"
                        onCheckedChange={toggleSelectAll}
                      />
                    </TableHead>
                    <TableHead className="w-28">姓氏</TableHead>
                    <TableHead className="w-24">类型</TableHead>
                    <TableHead className="w-20">优先级</TableHead>
                    <TableHead>适用题材</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead className="w-20">状态</TableHead>
                    <TableHead className="w-28">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.id)}
                          aria-label={`选择姓氏 ${item.surname}`}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell className="font-medium">{item.surname}</TableCell>
                      <TableCell>
                        <Badge variant={item.isCompound ? "default" : "secondary"}>
                          {item.isCompound ? "复姓" : "单姓"}
                        </Badge>
                      </TableCell>
                      <TableCell>{item.priority}</TableCell>
                      <TableCell>{item.bookType?.name ?? "通用"}</TableCell>
                      <TableCell className="max-w-70 truncate">{item.description ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "success" : "secondary"}>
                          {item.isActive ? "启用" : "停用"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`编辑姓氏 ${item.surname}`}
                            onClick={() => { setEditing(item); setDialogOpen(true); }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon-sm"
                            aria-label={`删除姓氏 ${item.surname}`}
                            onClick={() => setDeleteTarget(item)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </PageSection>

        <PageSection title="识别测试">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label>姓名样本</Label>
              <Input value={testName} onChange={(event) => setTestName(event.target.value)} placeholder="例如：诸葛亮 / 马二先生" />
            </div>
            <Button className="w-full" onClick={() => void handleTest()}>
              <WandSparkles className="mr-1 h-4 w-4" />
              运行测试
            </Button>
            {testResult ? (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div>输入：{testResult.input}</div>
                <div>提取姓氏：{testResult.extractedSurname ?? "未命中"}</div>
                <div>匹配类型：{surnameMatchTypeLabel(testResult.matchType)}</div>
                <div>优先级：{testResult.priority}</div>
              </div>
            ) : null}
          </div>
        </PageSection>
      </div>

      <SurnameGenerationDialog
        open={generateDialogOpen}
        bookTypes={bookTypes}
        onOpenChange={setGenerateDialogOpen}
        onReviewed={handleGenerationReviewed}
      />

      <SurnameGenerationReviewDialog
        open={reviewDialogOpen}
        review={generationReview}
        onOpenChange={setReviewDialogOpen}
        onSave={handleSaveReviewedCandidates}
      />

      <SurnameDialog
        open={dialogOpen}
        editing={editing}
        bookTypes={bookTypes}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>批量导入姓氏</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>输入内容</Label>
            <Textarea
              rows={10}
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder="支持用换行、空格、中文逗号或顿号分隔，例如：欧阳、司马、范、贾"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>取消</Button>
            <Button onClick={() => void handleImport()} disabled={!importText.trim()}>开始导入</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => {
          if (!open && !deletePending) {
            setDeleteTarget(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除姓氏</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除姓氏「{deleteTarget?.surname ?? ""}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={deletePending}
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deletePending || !deleteTarget}
              onClick={() => {
                if (deleteTarget) {
                  void handleDeleteConfirmed(deleteTarget);
                }
              }}
            >
              {deletePending ? "删除中..." : "删除"}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PageContainer>
  );
}

/**
 * 功能：姓氏词库“模型生成候选”弹框。
 * 输入：弹框开关、参考题材列表、审核回调。
 * 输出：无（通过 `onReviewed` 传递候选审核数据）。
 * 异常：接口失败统一转为 toast，不向上抛出异常。
 * 副作用：
 * - 打开弹框会刷新模型缓存，避免读取到过期模型列表；
 * - 预览与预审分别调用后端不同接口，更新本地预览与生成状态。
 */
function SurnameGenerationDialog({
  open,
  bookTypes,
  onOpenChange,
  onReviewed
}: {
  open        : boolean;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onReviewed  : (review: SurnameGenerationReviewResult) => void;
}) {
  const [targetCount, setTargetCount]                                 = useState("20");
  const [selectedModelId, setSelectedModelId]                         = useState("");
  const [selectedReferenceBookTypeId, setSelectedReferenceBookTypeId] = useState(NO_REFERENCE_BOOK_TYPE);
  const [additionalInstructions, setAdditionalInstructions]           = useState("");
  const [preview, setPreview]                                         = useState<SurnameGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]                           = useState(false);
  const [generating, setGenerating]                                   = useState(false);
  const [progressStep, setProgressStep]                               = useState("");
  const [elapsedSeconds, setElapsedSeconds]                           = useState(0);
  const pollingRef                                                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                                                   = useRef<number>(0);
  const { toast }                                                      = useToast();

  const {
    models: modelOptions,
    loading: modelsLoading,
    error: modelsError,
    defaultModel,
    refresh: refreshModels
  } = useAdminModels({ onlyEnabled: true });

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  // 弹框关闭时终止轮询并重置状态
  useEffect(() => {
    if (!open) {
      stopPolling();
      setGenerating(false);
      setProgressStep("");
      setElapsedSeconds(0);
      setPreview(null);
      return;
    }
    setTargetCount("20");
    setSelectedReferenceBookTypeId(NO_REFERENCE_BOOK_TYPE);
    setAdditionalInstructions("");
    setSelectedModelId(defaultModel?.id ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stopPolling]);

  useEffect(() => {
    if (!open) return;
    refreshModels();
  }, [open, refreshModels]);

  useEffect(() => {
    if (open && !selectedModelId && defaultModel) {
      setSelectedModelId(defaultModel.id);
    }
  }, [open, defaultModel, selectedModelId]);

  // 若已选模型已不在可用列表（被禁用/删除），清空并重新回填默认模型。
  useEffect(() => {
    if (!open || !selectedModelId) {
      return;
    }

    const stillExists = modelOptions.some((model) => model.id === selectedModelId);
    if (!stillExists) {
      setSelectedModelId("");
    }
  }, [open, modelOptions, selectedModelId]);

  // 计时器：生成期间每秒更新已用时间
  useEffect(() => {
    if (!generating) return;
    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);
    return () => clearInterval(timer);
  }, [generating]);

  async function handlePreview() {
    try {
      setPreviewLoading(true);
      const data = await previewSurnameGenerationPrompt({
        targetCount           : Number(targetCount) || 20,
        referenceBookTypeId   : selectedReferenceBookTypeId !== NO_REFERENCE_BOOK_TYPE ? selectedReferenceBookTypeId : undefined,
        additionalInstructions: additionalInstructions || undefined
      });
      setPreview(data);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleGenerate() {
    if (!selectedModelId) {
      toast({ title: "请先选择生成模型", variant: "destructive" });
      return;
    }

    try {
      setGenerating(true);
      setProgressStep("提交任务中…");

      const { jobId } = await reviewGeneratedSurnames({
        targetCount           : Number(targetCount) || 20,
        modelId               : selectedModelId,
        referenceBookTypeId   : selectedReferenceBookTypeId !== NO_REFERENCE_BOOK_TYPE ? selectedReferenceBookTypeId : undefined,
        additionalInstructions: additionalInstructions || undefined
      });

      setProgressStep("正在连接模型，准备生成…");

      pollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const job = await pollSurnameGenerationJob(jobId);
            setProgressStep(job.step);

            if (job.status === "done" && job.result) {
              stopPolling();
              setGenerating(false);
              toast({ title: "预审完成", description: `共生成 ${job.result.candidates.length} 条候选，跳过 ${job.result.skipped} 条，已过滤已有 ${job.result.skippedExisting} 条。` });
              onReviewed(job.result);
            } else if (job.status === "error") {
              stopPolling();
              setGenerating(false);
              toast({ title: "生成失败", description: job.error ?? "未知错误", variant: "destructive" });
            }
          } catch (pollError) {
            stopPolling();
            setGenerating(false);
            toast({ title: "轮询任务状态失败", description: String(pollError), variant: "destructive" });
          }
        })();
      }, 2000);
    } catch (error) {
      setGenerating(false);
      toast({ title: "提交任务失败", description: String(error), variant: "destructive" });
    }
  }

  const selectedModelName    = modelOptions.find((m) => m.id === selectedModelId)?.name;
  const selectedBookTypeName = bookTypes.find((bt) => bt.id === selectedReferenceBookTypeId)?.name;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (generating) return; onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>模型生成姓氏候选</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* 生成配置：模型独占一行，目标条数与题材并列 */}
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
                <Label>参考题材</Label>
                <Select value={selectedReferenceBookTypeId} onValueChange={setSelectedReferenceBookTypeId} disabled={generating}>
                  <SelectTrigger><SelectValue placeholder="不指定，通用场景" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_REFERENCE_BOOK_TYPE}>不指定，通用场景</SelectItem>
                    {bookTypes.map((bt) => <SelectItem key={bt.id} value={bt.id}>{bt.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {modelsError ? <p className="text-xs text-destructive">模型列表加载失败：{modelsError}</p> : null}
          {!modelsLoading && !modelsError && modelOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">当前暂无可用模型。请前往&quot;模型管理&quot;页面，至少启用并配置 1 个模型后再生成。</p>
          ) : null}

          {/* 当前选择概述 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>模型：<span className="font-medium text-foreground">{selectedModelName ?? "未选择"}</span></span>
            <span className="text-border">·</span>
            <span>题材：<span className="font-medium text-foreground">{selectedBookTypeName ?? "通用场景"}</span></span>
            <span className="text-border">·</span>
            <span>目标 {targetCount} 条</span>
          </div>

          <p className="text-xs text-muted-foreground">参考题材只参与本次提示词构造，不会自动建立知识归属关系。补充要求临时写入提示词，适合一次性约束。</p>

          {/* 补充要求 */}
          <div className="space-y-1.5">
            <Label>补充要求（可选）</Label>
            <Textarea rows={3} value={additionalInstructions} disabled={generating} onChange={(e) => setAdditionalInstructions(e.target.value)} placeholder="例如：优先补充复姓和明清小说中容易误判的人名开头；避免输出完整角色姓名。" />
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

function SurnameGenerationReviewDialog({
  open,
  review,
  onOpenChange,
  onSave
}: {
  open        : boolean;
  review      : SurnameGenerationReviewResult | null;
  onOpenChange: (open: boolean) => void;
  onSave      : (candidates: GeneratedSurnameCandidate[]) => Promise<void>;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !review) {
      return;
    }
    setSelected(new Set(review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.surname)));
  }, [open, review]);

  const selectedCandidates = useMemo(() => {
    if (!review) {
      return [];
    }
    return review.candidates.filter((candidate) => selected.has(candidate.surname));
  }, [review, selected]);

  function toggleCandidate(surname: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(surname)) {
        next.delete(surname);
      } else {
        next.add(surname);
      }
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    try {
      await onSave(selectedCandidates);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle>审核生成结果</DialogTitle>
        </DialogHeader>
        {review ? (
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              模型：{review.model.provider} / {review.model.modelName} · 候选 {review.candidates.length} 条 · 默认选中 {selected.size} 条 · 跳过 {review.skipped} 条 · 已过滤已有 {review.skippedExisting} 条
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.surname)))}
              >
                恢复推荐
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(review.candidates.map((candidate) => candidate.surname)))}
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
                    <TableHead>姓氏</TableHead>
                    <TableHead className="w-24">类型</TableHead>
                    <TableHead className="w-20">优先级</TableHead>
                    <TableHead className="w-20">置信度</TableHead>
                    <TableHead className="w-44">提示</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.candidates.map((candidate) => (
                    <TableRow key={candidate.surname}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(candidate.surname)}
                          onCheckedChange={() => toggleCandidate(candidate.surname)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{candidate.surname}</div>
                        {candidate.description ? <div className="mt-1 text-xs text-muted-foreground">{candidate.description}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={candidate.isCompound ? "default" : "secondary"}>{candidate.isCompound ? "复姓" : "单姓"}</Badge>
                      </TableCell>
                      <TableCell>{candidate.priority}</TableCell>
                      <TableCell>{candidate.confidence.toFixed(2)}</TableCell>
                      <TableCell>
                        {candidate.rejectionReason ? (
                          <div className="space-y-1 text-xs text-destructive">
                            <Badge variant="destructive">默认拒绝</Badge>
                            <div>{candidate.rejectionReason}</div>
                          </div>
                        ) : candidate.overlapSurname ? (
                          <div className="space-y-1 text-xs text-amber-700">
                            <Badge variant="warning">需复核</Badge>
                            <div>与已有姓氏 {candidate.overlapSurname} 重叠</div>
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

function SurnameDialog({
  open,
  editing,
  bookTypes,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : SurnameItem | null;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [surname, setSurname] = useState("");
  const [isCompound, setIsCompound] = useState(false);
  const [priority, setPriority] = useState(0);
  const [description, setDescription] = useState("");
  const [bookTypeId, setBookTypeId] = useState<string>("all");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setSurname(editing?.surname ?? "");
    setIsCompound(editing?.isCompound ?? false);
    setPriority(editing?.priority ?? 0);
    setDescription(editing?.description ?? "");
    setBookTypeId(editing?.bookTypeId ?? "all");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editing) {
        await updateSurname(editing.id, {
          priority,
          description: description || undefined,
          bookTypeId : bookTypeId === "all" ? null : bookTypeId,
          isActive
        });
      } else {
        await createSurname({
          surname,
          isCompound,
          priority,
          description: description || undefined,
          bookTypeId : bookTypeId === "all" ? undefined : bookTypeId
        });
      }
      toast({ title: editing ? "更新成功" : "创建成功" });
      onOpenChange(false);
      await onSaved();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "编辑姓氏" : "新增姓氏"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>姓氏</Label>
            <Input value={surname} onChange={(event) => setSurname(event.target.value)} disabled={!!editing} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>优先级</Label>
              <Input type="number" value={priority} onChange={(event) => setPriority(Number(event.target.value))} />
            </div>
            <div className="flex items-center gap-2 pt-6">
              <Switch checked={isCompound} onCheckedChange={setIsCompound} disabled={!!editing} />
              <Label>复姓</Label>
            </div>
          </div>
          <div className="grid gap-2">
            <Label>适用题材</Label>
            <Select value={bookTypeId} onValueChange={setBookTypeId}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">通用</SelectItem>
                {bookTypes.map((bookType) => (
                  <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>说明</Label>
            <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>启用</Label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button onClick={() => void handleSubmit()} disabled={saving || !surname.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
