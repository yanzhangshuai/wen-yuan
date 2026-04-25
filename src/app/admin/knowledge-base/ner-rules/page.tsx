"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

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
import { useAdminModels } from "@/hooks/use-admin-models";
import { useToast } from "@/hooks/use-toast";
import { BatchActionControls } from "@/app/admin/knowledge-base/batch-action-controls";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  batchNerLexiconRuleAction,
  createNerLexiconRule,
  deleteNerLexiconRule,
  fetchNerLexiconRules,
  generateNerLexiconRules,
  pollNerGenerationJob,
  previewNerLexiconGenerationPrompt,
  reorderNerLexiconRules,
  updateNerLexiconRule,
  type NerLexiconGenerationPreview,
  type NerLexiconRuleItem,
  type NerLexiconRuleType
} from "@/lib/services/ner-rules";

const ALL_BOOK_TYPES_VALUE = "__ALL_BOOK_TYPES__";
const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

const RULE_TYPE_OPTIONS: Array<{ value: NerLexiconRuleType; label: string }> = [
  { value: "HARD_BLOCK_SUFFIX", label: "强阻断后缀" },
  { value: "SOFT_BLOCK_SUFFIX", label: "软阻断后缀" },
  { value: "TITLE_STEM", label: "称谓词干" },
  { value: "POSITION_STEM", label: "职位词干" }
];

function getRuleTypeLabel(ruleType: NerLexiconRuleType) {
  return RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.label ?? ruleType;
}

function parseNerLexiconRuleType(value: string): NerLexiconRuleType {
  return RULE_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? "HARD_BLOCK_SUFFIX";
}

function getBookTypeLabel(bookTypes: BookTypeItem[], bookTypeId: string | null) {
  if (!bookTypeId) {
    return "通用";
  }

  return bookTypes.find((bookType) => bookType.id === bookTypeId)?.name ?? bookTypeId;
}

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

export default function NerRulesPage() {
  const [items, setItems] = useState<NerLexiconRuleItem[]>([]);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleType, setRuleType] = useState<NerLexiconRuleType>("HARD_BLOCK_SUFFIX");
  const [bookTypeFilter, setBookTypeFilter] = useState(ALL_BOOK_TYPES_VALUE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [editing, setEditing] = useState<NerLexiconRuleItem | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<NerLexiconRuleItem | null>(null);
  const [deletePending, setDeletePending] = useState(false);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ruleItems, bookTypeItems] = await Promise.all([
        fetchNerLexiconRules({
          ruleType,
          bookTypeId: bookTypeFilter !== ALL_BOOK_TYPES_VALUE ? bookTypeFilter : undefined
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(ruleItems.sort((left, right) => left.sortOrder - right.sortOrder));
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [bookTypeFilter, ruleType, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setSelected((previous) => new Set(items.filter((item) => previous.has(item.id)).map((item) => item.id)));
  }, [items]);

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);
  const selectedIds = useMemo(() => Array.from(selected), [selected]);
  const allSelected = items.length > 0 && selected.size === items.length;
  const partiallySelected = selected.size > 0 && !allSelected;

  function moveItem(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const nextItems = [...items];
    const [movedItem] = nextItems.splice(index, 1);
    nextItems.splice(targetIndex, 0, movedItem);
    setItems(nextItems.map((item, itemIndex) => ({ ...item, sortOrder: itemIndex + 1 })));
  }

  async function persistOrder() {
    try {
      await reorderNerLexiconRules(orderedIds);
      toast({ title: "排序已保存" });
      await load();
    } catch (error) {
      toast({ title: "排序保存失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: NerLexiconRuleItem) {
    setDeletePending(true);
    try {
      await deleteNerLexiconRule(item.id);
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
    action: Parameters<typeof batchNerLexiconRuleAction>[0],
    successTitle: string
  ) {
    try {
      const result = await batchNerLexiconRuleAction(action);
      toast({
        title      : successTitle,
        description: `已处理 ${result.count} 条词典规则。`
      });
      setSelected(new Set());
      await load();
    } catch (error) {
      toast({ title: "批量操作失败", description: String(error), variant: "destructive" });
      throw error;
    }
  }

  async function handleGenerationCompleted() {
    setGenerateDialogOpen(false);
    await load();
  }

  return (
    <PageContainer>
      <PageHeader
        title="NER 词典规则"
        description="维护命名实体识别的词典规则（后缀阻断、称谓词干、职位词干）。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "NER 词典规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" />
            模型生成
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void persistOrder()} disabled={items.length === 0}>
            保存排序
          </Button>
          <Button type="button" size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增规则
          </Button>
        </div>
      </PageHeader>

      <PageSection>
        <div className="mb-4 grid gap-3 md:grid-cols-[180px_240px_auto]">
          <Select value={ruleType} onValueChange={(value) => setRuleType(parseNerLexiconRuleType(value))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {RULE_TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={bookTypeFilter} onValueChange={setBookTypeFilter}>
            <SelectTrigger><SelectValue placeholder="全部书籍类型" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL_BOOK_TYPES_VALUE}>全部书籍类型</SelectItem>
              {bookTypes.map((bookType) => (
                <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" onClick={() => void load()}>刷新</Button>
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
                      aria-label="全选 NER 词典规则"
                      onCheckedChange={toggleSelectAll}
                    />
                  </TableHead>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead className="w-36">规则类型</TableHead>
                  <TableHead>词典内容</TableHead>
                  <TableHead className="w-36">书籍类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
                <TableBody>
                  {items.map((item, index) => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(item.id)}
                          aria-label={`选择规则 ${item.content}`}
                          onCheckedChange={() => toggleSelect(item.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span>{item.sortOrder}</span>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="上移规则"
                          onClick={() => moveItem(index, -1)}
                          disabled={index === 0}
                        >
                          <ArrowUp className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="下移规则"
                          onClick={() => moveItem(index, 1)}
                          disabled={index === items.length - 1}
                        >
                          <ArrowDown className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                    <TableCell>{getRuleTypeLabel(item.ruleType)}</TableCell>
                    <TableCell className="font-mono text-sm whitespace-pre-wrap">{item.content}</TableCell>
                    <TableCell className="text-muted-foreground">{getBookTypeLabel(bookTypes, item.bookTypeId)}</TableCell>
                    <TableCell>
                      <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="编辑规则"
                          onClick={() => { setEditing(item); setDialogOpen(true); }}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label="删除规则"
                          onClick={() => setDeleteTarget(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-8 text-center text-muted-foreground">暂无规则</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <NerRuleGenerationDialog
        open={generateDialogOpen}
        ruleType={ruleType}
        bookTypes={bookTypes}
        onOpenChange={setGenerateDialogOpen}
        onGenerated={handleGenerationCompleted}
      />

      <NerRuleDialog
        open={dialogOpen}
        editing={editing}
        ruleType={ruleType}
        bookTypes={bookTypes}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />

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
            <AlertDialogTitle>确认删除词典规则</AlertDialogTitle>
            <AlertDialogDescription>
              确定删除该词典规则吗？此操作不可恢复。
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
                  void handleDelete(deleteTarget);
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

interface NerRuleGenerationDialogProps {
  open        : boolean;
  ruleType    : NerLexiconRuleType;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onGenerated : () => Promise<void>;
}

/**
 * 模型生成会直接写入停用规则，弹框只负责提交任务、轮询状态和刷新列表。
 */
function NerRuleGenerationDialog({
  open,
  ruleType,
  bookTypes,
  onOpenChange,
  onGenerated
}: NerRuleGenerationDialogProps) {
  const [localRuleType, setLocalRuleType]         = useState<NerLexiconRuleType>(ruleType);
  const [targetCount, setTargetCount]             = useState("20");
  const [selectedModelId, setSelectedModelId]     = useState("");
  const [bookTypeId, setBookTypeId]               = useState(GLOBAL_BOOK_TYPE_VALUE);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [preview, setPreview]                     = useState<NerLexiconGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]       = useState(false);
  const [generating, setGenerating]               = useState(false);
  const [progressStep, setProgressStep]           = useState("");
  const [elapsedSeconds, setElapsedSeconds]       = useState(0);
  const pollingRef                                = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                              = useRef<number>(0);
  const { toast }                                 = useToast();

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

  useEffect(() => {
    if (!open) {
      stopPolling();
      setGenerating(false);
      setProgressStep("");
      setElapsedSeconds(0);
      setPreview(null);
      return;
    }

    setLocalRuleType(ruleType);
    setTargetCount("20");
    setBookTypeId(GLOBAL_BOOK_TYPE_VALUE);
    setAdditionalInstructions("");
    setSelectedModelId(defaultModel?.id ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, ruleType, stopPolling]);

  useEffect(() => {
    if (!open) {
      return;
    }

    refreshModels();
  }, [open, refreshModels]);

  useEffect(() => {
    if (open && !selectedModelId && defaultModel) {
      setSelectedModelId(defaultModel.id);
    }
  }, [open, defaultModel, selectedModelId]);

  useEffect(() => {
    if (!open || !selectedModelId) {
      return;
    }

    const stillExists = modelOptions.some((model) => model.id === selectedModelId);
    if (!stillExists) {
      setSelectedModelId("");
    }
  }, [open, modelOptions, selectedModelId]);

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
      const data = await previewNerLexiconGenerationPrompt({
        ruleType              : localRuleType,
        targetCount           : Number(targetCount) || 20,
        bookTypeId            : bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
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

      const { jobId } = await generateNerLexiconRules({
        ruleType              : localRuleType,
        targetCount           : Number(targetCount) || 20,
        bookTypeId            : bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
        additionalInstructions: additionalInstructions || undefined,
        modelId               : selectedModelId
      });

      setProgressStep("正在连接模型，准备生成…");

      pollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const job = await pollNerGenerationJob(jobId);
            setProgressStep(job.step);

            if (job.status === "done" && job.result) {
              stopPolling();
              setGenerating(false);
              toast({
                title      : "生成完成",
                description: `新增 ${job.result.created} 条，跳过 ${job.result.skipped} 条；新规则默认停用。`
              });
              await onGenerated();
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

  const selectedModelName = modelOptions.find((model) => model.id === selectedModelId)?.name;
  const selectedBookTypeName = bookTypeId === GLOBAL_BOOK_TYPE_VALUE
    ? "通用规则"
    : bookTypes.find((bookType) => bookType.id === bookTypeId)?.name ?? "未知书籍类型";

  return (
    <Dialog open={open} onOpenChange={(next) => { if (generating) return; onOpenChange(next); }}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>模型生成 NER 词典规则</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>生成模型</Label>
              <Select value={selectedModelId} onValueChange={setSelectedModelId} disabled={modelsLoading || generating}>
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? "加载中…" : modelOptions.length === 0 ? "暂无可用模型" : "选择模型"} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.length === 0 ? (
                    <SelectItem value="__no_model_available__" disabled>暂无可用模型（请在模型管理中配置 API Key）</SelectItem>
                  ) : modelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>{formatGenerationModelOption(model)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>规则类型</Label>
                <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parseNerLexiconRuleType(value))} disabled={generating}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {RULE_TYPE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>目标条数</Label>
                <Input type="number" min={1} max={200} value={targetCount} disabled={generating} onChange={(event) => setTargetCount(event.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>书籍类型</Label>
                <Select value={bookTypeId} onValueChange={setBookTypeId} disabled={generating}>
                  <SelectTrigger><SelectValue placeholder="通用规则" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={GLOBAL_BOOK_TYPE_VALUE}>通用规则</SelectItem>
                    {bookTypes.map((bookType) => (
                      <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {modelsError ? <p className="text-xs text-destructive">模型列表加载失败：{modelsError}</p> : null}
          {!modelsLoading && !modelsError && modelOptions.length === 0 ? (
            <p className="text-xs text-muted-foreground">当前暂无可用模型。请前往&quot;模型管理&quot;页面，至少配置 1 个模型的 API Key 后再生成。</p>
          ) : null}

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
            <span>模型：<span className="font-medium text-foreground">{selectedModelName ?? "未选择"}</span></span>
            <span className="text-border">·</span>
            <span>类型：<span className="font-medium text-foreground">{getRuleTypeLabel(localRuleType)}</span></span>
            <span className="text-border">·</span>
            <span>书籍类型：<span className="font-medium text-foreground">{selectedBookTypeName}</span></span>
            <span className="text-border">·</span>
            <span>目标 {targetCount} 条</span>
          </div>

          <p className="text-xs text-muted-foreground">
            生成结果会直接写入数据库，来源为 LLM_SUGGESTED，默认停用；完成后请在列表中复核并手动启用。
          </p>

          <div className="space-y-1.5">
            <Label>补充要求（可选）</Label>
            <Textarea
              rows={3}
              value={additionalInstructions}
              disabled={generating}
              onChange={(event) => setAdditionalInstructions(event.target.value)}
              placeholder="例如：优先补充容易被古典小说人物识别误判的称谓后缀；避免输出完整人名。"
            />
          </div>

          {generating ? (
            <div className="flex flex-col items-center gap-3 rounded-md border bg-muted/30 px-4 py-5">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              <div className="text-center">
                <p className="text-sm font-medium">{progressStep || "生成中…"}</p>
                <p className="mt-1 text-xs text-muted-foreground">已用时 {elapsedSeconds} 秒，模型推理可能需要 1~3 分钟，请勿关闭此窗口</p>
              </div>
            </div>
          ) : null}

          {!generating ? (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>
                {previewLoading ? "预览中…" : "预览提示词"}
              </Button>
              <Button type="button" onClick={() => void handleGenerate()} disabled={!selectedModelId}>
                开始生成
              </Button>
            </div>
          ) : null}

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
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>关闭</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NerRuleDialog({
  open,
  editing,
  ruleType,
  bookTypes,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : NerLexiconRuleItem | null;
  ruleType    : NerLexiconRuleType;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [localRuleType, setLocalRuleType] = useState<NerLexiconRuleType>(ruleType);
  const [content, setContent] = useState("");
  const [bookTypeId, setBookTypeId] = useState(GLOBAL_BOOK_TYPE_VALUE);
  const [sortOrder, setSortOrder] = useState(1);
  const [changeNote, setChangeNote] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;

    setLocalRuleType(editing?.ruleType ?? ruleType);
    setContent(editing?.content ?? "");
    setBookTypeId(editing?.bookTypeId ?? GLOBAL_BOOK_TYPE_VALUE);
    setSortOrder(editing?.sortOrder ?? 1);
    setChangeNote(editing?.changeNote ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open, ruleType]);

  async function handleSubmit() {
    setSaving(true);
    try {
      if (editing) {
        await updateNerLexiconRule(editing.id, {
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createNerLexiconRule({
          ruleType  : localRuleType,
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
          sortOrder,
          changeNote: changeNote || undefined
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
          <DialogTitle>{editing ? "编辑词典规则" : "新增词典规则"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>规则类型</Label>
            <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parseNerLexiconRuleType(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>词典内容（词条、后缀或词干）</Label>
            <Textarea rows={4} value={content} onChange={(event) => setContent(event.target.value)} placeholder="每行一个词条，或输入单个模式" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>书籍类型</Label>
              <Select value={bookTypeId} onValueChange={setBookTypeId}>
                <SelectTrigger><SelectValue placeholder="选择书籍类型" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={GLOBAL_BOOK_TYPE_VALUE}>通用规则</SelectItem>
                  {bookTypes.map((bookType) => (
                    <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input type="number" value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>变更说明</Label>
            <Input value={changeNote} onChange={(event) => setChangeNote(event.target.value)} />
          </div>
          {editing ? (
            <div className="flex items-center gap-2">
              <Switch checked={isActive} onCheckedChange={setIsActive} />
              <Label>启用</Label>
            </div>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>取消</Button>
          <Button type="button" onClick={() => void handleSubmit()} disabled={saving || !content.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
