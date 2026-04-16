"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Eye, Pencil, Plus, Sparkles, Trash2 } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  createPromptExtractionRule,
  deletePromptExtractionRule,
  fetchPromptExtractionRules,
  generatePromptExtractionRules,
  pollPromptRuleGenerationJob,
  previewCombinedPromptRules,
  previewPromptExtractionGenerationPrompt,
  reorderPromptExtractionRules,
  updatePromptExtractionRule,
  type CombinedPromptRulesPreview,
  type PromptExtractionGenerationPreview,
  type PromptExtractionRuleItem,
  type PromptRuleType
} from "@/lib/services/prompt-extraction-rules";

const ALL_BOOK_TYPES_VALUE = "__ALL_BOOK_TYPES__";
const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

const RULE_TYPE_OPTIONS: Array<{ value: PromptRuleType; label: string }> = [
  { value: "ENTITY", label: "实体规则" },
  { value: "RELATIONSHIP", label: "关系规则" }
];

function getRuleTypeLabel(ruleType: PromptRuleType) {
  return RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.label ?? ruleType;
}

function parsePromptRuleType(value: string): PromptRuleType {
  return RULE_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? "ENTITY";
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

export default function PromptExtractionRulesPage() {
  const [items, setItems] = useState<PromptExtractionRuleItem[]>([]);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [ruleType, setRuleType] = useState<PromptRuleType>("ENTITY");
  const [bookTypeFilter, setBookTypeFilter] = useState(ALL_BOOK_TYPES_VALUE);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<CombinedPromptRulesPreview | null>(null);
  const [editing, setEditing] = useState<PromptExtractionRuleItem | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [ruleItems, bookTypeItems] = await Promise.all([
        fetchPromptExtractionRules({
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

  const orderedIds = useMemo(() => items.map((item) => item.id), [items]);

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
      await reorderPromptExtractionRules(orderedIds);
      toast({ title: "排序已保存" });
      await load();
    } catch (error) {
      toast({ title: "排序保存失败", description: String(error), variant: "destructive" });
    }
  }

  async function handlePreview() {
    try {
      const data = await previewCombinedPromptRules(
        ruleType,
        bookTypeFilter !== ALL_BOOK_TYPES_VALUE ? bookTypeFilter : undefined
      );
      setPreviewData(data);
      setPreviewOpen(true);
    } catch (error) {
      toast({ title: "预览失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleDelete(item: PromptExtractionRuleItem) {
    if (!confirm("确定删除该 Prompt 规则吗？")) return;

    try {
      await deletePromptExtractionRule(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleGenerationCompleted() {
    setGenerateDialogOpen(false);
    await load();
  }

  return (
    <PageContainer>
      <PageHeader
        title="Prompt 提取规则"
        description="维护实体和关系抽取时拼接进 Prompt 的规则列表。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "Prompt 提取规则" }
        ]}
      >
        <div className="flex gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" />
            模型生成
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => void handlePreview()}>
            <Eye className="mr-1 h-4 w-4" />
            组合预览
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
          <Select value={ruleType} onValueChange={(value) => setRuleType(parsePromptRuleType(value))}>
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

        {loading ? (
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-24">排序</TableHead>
                  <TableHead className="w-32">规则类型</TableHead>
                  <TableHead>规则内容</TableHead>
                  <TableHead className="w-36">书籍类型</TableHead>
                  <TableHead className="w-24">状态</TableHead>
                  <TableHead className="w-28">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item, index) => (
                  <TableRow key={item.id}>
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
                    <TableCell className="whitespace-pre-wrap">{item.content}</TableCell>
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
                          onClick={() => void handleDelete(item)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {items.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">暂无规则</TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        )}
      </PageSection>

      <PromptRuleDialog
        open={dialogOpen}
        editing={editing}
        ruleType={ruleType}
        bookTypes={bookTypes}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />

      <PromptRuleGenerationDialog
        open={generateDialogOpen}
        ruleType={ruleType}
        bookTypes={bookTypes}
        onOpenChange={setGenerateDialogOpen}
        onGenerated={handleGenerationCompleted}
      />

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>规则组合预览</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-sm text-muted-foreground">
              当前共 {previewData?.count ?? 0} 条规则，类型：{previewData?.ruleType ? getRuleTypeLabel(previewData.ruleType) : ""}
            </div>
            <pre className="max-h-[460px] overflow-auto rounded-md bg-muted p-3 text-xs whitespace-pre-wrap">
              {previewData?.combined ?? ""}
            </pre>
          </div>
        </DialogContent>
      </Dialog>
    </PageContainer>
  );
}

interface PromptRuleGenerationDialogProps {
  open        : boolean;
  ruleType    : PromptRuleType;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onGenerated : () => Promise<void>;
}

/**
 * 模型生成会直接写入停用规则，避免在前端复制后端去重与排序规则。
 */
function PromptRuleGenerationDialog({
  open,
  ruleType,
  bookTypes,
  onOpenChange,
  onGenerated
}: PromptRuleGenerationDialogProps) {
  const [localRuleType, setLocalRuleType]         = useState<PromptRuleType>(ruleType);
  const [targetCount, setTargetCount]             = useState("10");
  const [selectedModelId, setSelectedModelId]     = useState("");
  const [bookTypeId, setBookTypeId]               = useState(GLOBAL_BOOK_TYPE_VALUE);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [preview, setPreview]                     = useState<PromptExtractionGenerationPreview | null>(null);
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
    setTargetCount("10");
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
      const data = await previewPromptExtractionGenerationPrompt({
        ruleType              : localRuleType,
        targetCount           : Number(targetCount) || 10,
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

      const { jobId } = await generatePromptExtractionRules({
        ruleType              : localRuleType,
        targetCount           : Number(targetCount) || 10,
        bookTypeId            : bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : undefined,
        additionalInstructions: additionalInstructions || undefined,
        modelId               : selectedModelId
      });

      setProgressStep("正在连接模型，准备生成…");

      pollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const job = await pollPromptRuleGenerationJob(jobId);
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
          <DialogTitle>模型生成 Prompt 提取规则</DialogTitle>
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
                    <SelectItem value="__no_model_available__" disabled>暂无可用模型（请在模型管理中启用并配置 Key）</SelectItem>
                  ) : modelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>{formatGenerationModelOption(model)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label>规则类型</Label>
                <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parsePromptRuleType(value))} disabled={generating}>
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
                <Input type="number" min={1} max={100} value={targetCount} disabled={generating} onChange={(event) => setTargetCount(event.target.value)} />
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
            <p className="text-xs text-muted-foreground">当前暂无可用模型。请前往&quot;模型管理&quot;页面，至少启用并配置 1 个模型后再生成。</p>
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
              placeholder="例如：优先补充古典小说关系抽取容易遗漏的规则；避免生成过长、带示例编号的条目。"
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

function PromptRuleDialog({
  open,
  editing,
  ruleType,
  bookTypes,
  onOpenChange,
  onSaved
}: {
  open        : boolean;
  editing     : PromptExtractionRuleItem | null;
  ruleType    : PromptRuleType;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}) {
  const [localRuleType, setLocalRuleType] = useState<PromptRuleType>(ruleType);
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
        await updatePromptExtractionRule(editing.id, {
          content,
          bookTypeId: bookTypeId !== GLOBAL_BOOK_TYPE_VALUE ? bookTypeId : null,
          sortOrder,
          changeNote: changeNote || undefined,
          isActive
        });
      } else {
        await createPromptExtractionRule({
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
          <DialogTitle>{editing ? "编辑 Prompt 规则" : "新增 Prompt 规则"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>规则类型</Label>
            <Select value={localRuleType} onValueChange={(value) => setLocalRuleType(parsePromptRuleType(value))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {RULE_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-2">
            <Label>规则内容</Label>
            <Textarea rows={6} value={content} onChange={(event) => setContent(event.target.value)} />
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
