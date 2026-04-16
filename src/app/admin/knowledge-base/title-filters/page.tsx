"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Search, Sparkles, Trash2, WandSparkles } from "lucide-react";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import {
  GENERIC_TITLE_TIER_OPTIONS,
  getGenericTitleTierDescription,
  getGenericTitleTierLabel
} from "@/lib/knowledge-presentation";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  createGenericTitle,
  deleteGenericTitle,
  fetchGenericTitles,
  pollTitleFilterGenerationJob,
  previewGenericTitleGenerationPrompt,
  reviewGeneratedGenericTitles,
  testGenericTitle,
  type GeneratedGenericTitleCandidate,
  type GenericTitleGenerationPreview,
  type GenericTitleGenerationReviewResult,
  type GenericTitleItem,
  type GenericTitleTestResult,
  updateGenericTitle
} from "@/lib/services/title-filters";

type TierFilter = "all" | "SAFETY" | "DEFAULT";

const NO_REFERENCE_BOOK_TYPE = "all";

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

function genericTitleTestResultLabel(result: string): string {
  switch (result) {
    case "generic":
      return "按泛称处理";
    case "exempt":
      return "已豁免";
    case "not_found":
      return "未命中";
    default:
      return result;
  }
}

export default function TitleFiltersPage() {
  const [items, setItems] = useState<GenericTitleItem[]>([]);
  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tier, setTier] = useState<TierFilter>("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<GenericTitleItem | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
  const [generationReview, setGenerationReview] = useState<GenericTitleGenerationReviewResult | null>(null);
  const [testTitle, setTestTitle] = useState("");
  const [testGenre, setTestGenre] = useState("");
  const [testResult, setTestResult] = useState<GenericTitleTestResult | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [genericTitleItems, bookTypeItems] = await Promise.all([
        fetchGenericTitles({
          tier: tier === "all" ? undefined : tier,
          q   : query || undefined
        }),
        fetchBookTypes({ active: true })
      ]);
      setItems(genericTitleItems);
      setBookTypes(bookTypeItems);
    } catch (error) {
      toast({ title: "加载失败", description: String(error), variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [query, tier, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleDelete(item: GenericTitleItem) {
    if (!confirm(`确定删除称谓「${item.title}」吗？`)) return;
    try {
      await deleteGenericTitle(item.id);
      toast({ title: "删除成功" });
      await load();
    } catch (error) {
      toast({ title: "删除失败", description: String(error), variant: "destructive" });
    }
  }

  async function handleTest() {
    if (!testTitle.trim()) return;
    try {
      const result = await testGenericTitle(testTitle.trim(), testGenre.trim() || undefined);
      setTestResult(result);
    } catch (error) {
      toast({ title: "测试失败", description: String(error), variant: "destructive" });
    }
  }

  function handleGenerationReviewed(review: GenericTitleGenerationReviewResult) {
    setGenerationReview(review);
    setGenerateDialogOpen(false);
    setReviewDialogOpen(true);
  }

  async function handleSaveReviewedCandidates(candidates: GeneratedGenericTitleCandidate[]) {
    const settled = await Promise.allSettled(
      candidates.map((candidate) => createGenericTitle({
        title         : candidate.title,
        tier          : candidate.tier,
        exemptInGenres: candidate.exemptInGenres.length > 0 ? candidate.exemptInGenres : undefined,
        description   : candidate.description ?? undefined,
        source        : "LLM_SUGGESTED"
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
        title="泛化称谓"
        description="维护安全泛称、默认泛称词表，并按书籍类型配置豁免规则。"
        breadcrumbs={[
          { label: "管理后台", href: "/admin" },
          { label: "知识库", href: "/admin/knowledge-base" },
          { label: "泛化称谓" }
        ]}
      >
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setGenerateDialogOpen(true)}>
            <Sparkles className="mr-1 h-4 w-4" />
            模型生成
          </Button>
          <Button size="sm" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="mr-1 h-4 w-4" />
            新增称谓
          </Button>
        </div>
      </PageHeader>

      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <PageSection>
          <div className="mb-4 grid gap-3 md:grid-cols-[1fr_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索称谓" />
            </div>
            <Select value={tier} onValueChange={(value) => setTier(value as TierFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部层级</SelectItem>
                {GENERIC_TITLE_TIER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={() => void load()}>刷新</Button>
          </div>

          {loading ? (
            <div className="py-12 text-center text-muted-foreground">加载中...</div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-32">称谓</TableHead>
                    <TableHead className="w-32">层级</TableHead>
                    <TableHead>书籍类型豁免</TableHead>
                    <TableHead>说明</TableHead>
                    <TableHead className="w-20">状态</TableHead>
                    <TableHead className="w-28">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.title}</TableCell>
                      <TableCell>
                        <Badge variant={item.tier === "SAFETY" ? "destructive" : "secondary"}>{getGenericTitleTierLabel(item.tier)}</Badge>
                      </TableCell>
                      <TableCell>{item.exemptInGenres?.length ? item.exemptInGenres.join("、") : "-"}</TableCell>
                      <TableCell className="max-w-65 truncate">{item.description ?? "-"}</TableCell>
                      <TableCell>
                        <Badge variant={item.isActive ? "success" : "secondary"}>{item.isActive ? "启用" : "停用"}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="sm" onClick={() => { setEditing(item); setDialogOpen(true); }}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={() => void handleDelete(item)}>
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

        <PageSection title="匹配测试">
          <div className="space-y-4 rounded-md border p-4">
            <div className="space-y-2">
              <Label>称谓</Label>
              <Input value={testTitle} onChange={(event) => setTestTitle(event.target.value)} placeholder="例如：丞相 / 老爷" />
            </div>
            <div className="space-y-2">
              <Label>书籍类型键（可选）</Label>
              <Input value={testGenre} onChange={(event) => setTestGenre(event.target.value)} placeholder="例如：历史演义" />
            </div>
            <Button className="w-full" onClick={() => void handleTest()}>
              <WandSparkles className="mr-1 h-4 w-4" />
              执行测试
            </Button>
            {testResult ? (
              <div className="rounded-md bg-muted/40 p-3 text-sm">
                <div>结果：{genericTitleTestResultLabel(testResult.result)}</div>
                <div>层级：{testResult.tier ? getGenericTitleTierLabel(testResult.tier) : "-"}</div>
                <div>原因：{testResult.reason}</div>
              </div>
            ) : null}
          </div>
        </PageSection>
      </div>

      <GenericTitleGenerationDialog
        open={generateDialogOpen}
        bookTypes={bookTypes}
        onOpenChange={setGenerateDialogOpen}
        onReviewed={handleGenerationReviewed}
      />

      <GenericTitleGenerationReviewDialog
        open={reviewDialogOpen}
        review={generationReview}
        onOpenChange={setReviewDialogOpen}
        onSave={handleSaveReviewedCandidates}
      />

      <GenericTitleDialog
        open={dialogOpen}
        editing={editing}
        onOpenChange={setDialogOpen}
        onSaved={load}
      />
    </PageContainer>
  );
}

/**
 * 功能：泛化称谓“模型生成候选”弹框。
 * 输入：弹框开关、参考题材列表、审核回调。
 * 输出：无（通过 `onReviewed` 把预审候选交给上层）。
 * 异常：接口失败统一通过 toast 呈现，不向外抛错。
 * 副作用：
 * - 打开弹框会刷新模型缓存，保证下拉读取的是最新可用模型；
 * - 预览/预审会分别更新局部状态并驱动后续审核流程。
 */
interface GenericTitleGenerationDialogProps {
  open        : boolean;
  bookTypes   : BookTypeItem[];
  onOpenChange: (open: boolean) => void;
  onReviewed  : (review: GenericTitleGenerationReviewResult) => void;
}

function GenericTitleGenerationDialog({
  open,
  bookTypes,
  onOpenChange,
  onReviewed
}: GenericTitleGenerationDialogProps) {
  const [targetCount, setTargetCount]                                  = useState("20");
  const [selectedModelId, setSelectedModelId]                          = useState("");
  const [selectedReferenceBookTypeId, setSelectedReferenceBookTypeId]  = useState(NO_REFERENCE_BOOK_TYPE);
  const [additionalInstructions, setAdditionalInstructions]            = useState("");
  const [preview, setPreview]                                          = useState<GenericTitleGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]                            = useState(false);
  const [generating, setGenerating]                                    = useState(false);
  const [progressStep, setProgressStep]                                = useState("");
  const [elapsedSeconds, setElapsedSeconds]                            = useState(0);
  const pollingRef                                                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                                                   = useRef<number>(0);
  const { toast }                                                      = useToast();
  const normalizedTargetCount                                          = useMemo(() => {
    const parsed = Number(targetCount);
    if (!Number.isFinite(parsed)) {
      return 20;
    }

    return Math.min(200, Math.max(1, Math.floor(parsed)));
  }, [targetCount]);

  // 统一 Store：模块级缓存 + 后台重校验。
  // 额外读取 error/refresh，用于弹框内显式反馈与主动刷新。
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

  // 弹框关闭时终止轮询并重置状态；打开时回填默认配置。
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
    setPreview(null);
    setSelectedModelId(defaultModel?.id ?? "");
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, stopPolling]);

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

  // 计时器只在模型生成任务运行期间生效。
  useEffect(() => {
    if (!generating) return;

    startTimeRef.current = Date.now();
    const timer = setInterval(() => {
      setElapsedSeconds(Math.floor((Date.now() - startTimeRef.current) / 1000));
    }, 1000);

    return () => clearInterval(timer);
  }, [generating]);

  // 仅预览提示词，不执行写入。
  async function handlePreview() {
    try {
      setPreviewLoading(true);
      const data = await previewGenericTitleGenerationPrompt({
        targetCount           : normalizedTargetCount,
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

  // 执行预审，返回候选给审核弹框进行人工确认。
  async function handleGenerate() {
    if (!selectedModelId) {
      toast({ title: "请先选择生成模型", variant: "destructive" });
      return;
    }

    try {
      setGenerating(true);
      setProgressStep("提交任务中…");

      const { jobId } = await reviewGeneratedGenericTitles({
        targetCount           : normalizedTargetCount,
        modelId               : selectedModelId,
        referenceBookTypeId   : selectedReferenceBookTypeId !== NO_REFERENCE_BOOK_TYPE ? selectedReferenceBookTypeId : undefined,
        additionalInstructions: additionalInstructions || undefined
      });

      setProgressStep("正在连接模型，准备生成…");

      pollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const job = await pollTitleFilterGenerationJob(jobId);
            setProgressStep(job.step);

            if (job.status === "done" && job.result) {
              stopPolling();
              setGenerating(false);
              toast({ title: "预审完成", description: `共生成 ${job.result.candidates.length} 条候选，跳过 ${job.result.skipped} 条。` });
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
          <DialogTitle>模型生成泛化称谓候选</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">

          {/* 生成配置 */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label>目标条数</Label>
              <Input
                type="number"
                min={1}
                max={200}
                value={targetCount}
                disabled={generating}
                onChange={(event) => setTargetCount(event.target.value)}
                onBlur={() => setTargetCount(String(normalizedTargetCount))}
              />
            </div>
            <div className="space-y-1.5">
              <Label>参考题材</Label>
              <Select value={selectedReferenceBookTypeId} onValueChange={setSelectedReferenceBookTypeId} disabled={generating}>
                <SelectTrigger>
                  <SelectValue placeholder="不指定，通用场景" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_REFERENCE_BOOK_TYPE}>不指定，通用场景</SelectItem>
                  {bookTypes.map((bookType) => (
                    <SelectItem key={bookType.id} value={bookType.id}>{bookType.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>生成模型</Label>
              <Select
                value={selectedModelId}
                onValueChange={setSelectedModelId}
                disabled={modelsLoading || generating}
              >
                <SelectTrigger>
                  <SelectValue placeholder={modelsLoading ? "加载中…" : modelOptions.length === 0 ? "暂无可用模型" : "选择模型"} />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.length === 0 ? (
                    <SelectItem value="__no_model_available__" disabled>
                      暂无可用模型（请在模型管理中启用并配置 Key）
                    </SelectItem>
                  ) : modelOptions.map((model) => (
                    <SelectItem key={model.id} value={model.id}>
                      {formatGenerationModelOption(model)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
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
            <span>模型：<span className="font-medium text-foreground">{selectedModelName ?? "未选择"}</span></span>
            <span className="text-border">·</span>
            <span>题材：<span className="font-medium text-foreground">{selectedBookTypeName ?? "通用场景"}</span></span>
            <span className="text-border">·</span>
            <span>目标 {normalizedTargetCount} 条</span>
          </div>

          {/* 使用说明 */}
          <p className="text-xs text-muted-foreground">
            参考题材只参与本次提示词构造，不会自动建立知识归属关系。补充要求临时写入提示词，适合一次性约束；如需长期生效应沉淀到提示词模板。
          </p>

          {/* 补充要求 */}
          <div className="space-y-1.5">
            <Label>补充要求（可选）</Label>
            <Textarea
              rows={3}
              value={additionalInstructions}
              disabled={generating}
              onChange={(event) => setAdditionalInstructions(event.target.value)}
              placeholder="例如：优先补充容易误判为人物名的称谓；武侠场景下请特别标注需要题材豁免的称谓。"
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

          {/* 操作按钮 */}
          {!generating ? (
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => void handlePreview()}
                disabled={previewLoading}
              >
                {previewLoading ? "预览中…" : "预览提示词"}
              </Button>
              <Button
                onClick={() => void handleGenerate()}
                disabled={!selectedModelId}
              >
                开始预审
              </Button>
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

interface GenericTitleGenerationReviewDialogProps {
  open        : boolean;
  review      : GenericTitleGenerationReviewResult | null;
  onOpenChange: (open: boolean) => void;
  onSave      : (candidates: GeneratedGenericTitleCandidate[]) => Promise<void>;
}

function GenericTitleGenerationReviewDialog({
  open,
  review,
  onOpenChange,
  onSave
}: GenericTitleGenerationReviewDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open || !review) {
      return;
    }
    setSelected(new Set(review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.title)));
  }, [open, review]);

  const selectedCandidates = useMemo(() => {
    if (!review) {
      return [];
    }
    return review.candidates.filter((candidate) => selected.has(candidate.title));
  }, [review, selected]);

  function toggleCandidate(title: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(title)) {
        next.delete(title);
      } else {
        next.add(title);
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
              模型：{review.model.provider} / {review.model.modelName} · 候选 {review.candidates.length} 条 · 默认选中 {selected.size} 条 · 跳过 {review.skipped} 条
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.title)))}
              >
                恢复推荐
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set(review.candidates.map((candidate) => candidate.title)))}
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
                    <TableHead>称谓</TableHead>
                    <TableHead className="w-28">层级</TableHead>
                    <TableHead>题材豁免</TableHead>
                    <TableHead className="w-20">置信度</TableHead>
                    <TableHead className="w-44">提示</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {review.candidates.map((candidate) => (
                    <TableRow key={candidate.title}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(candidate.title)}
                          onCheckedChange={() => toggleCandidate(candidate.title)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{candidate.title}</div>
                        {candidate.description ? <div className="mt-1 text-xs text-muted-foreground">{candidate.description}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={candidate.tier === "SAFETY" ? "destructive" : "secondary"}>{getGenericTitleTierLabel(candidate.tier)}</Badge>
                      </TableCell>
                      <TableCell>{candidate.exemptInGenres.length > 0 ? candidate.exemptInGenres.join("、") : "-"}</TableCell>
                      <TableCell>{candidate.confidence.toFixed(2)}</TableCell>
                      <TableCell>
                        {candidate.rejectionReason ? (
                          <div className="space-y-1 text-xs text-destructive">
                            <Badge variant="destructive">默认拒绝</Badge>
                            <div>{candidate.rejectionReason}</div>
                          </div>
                        ) : candidate.overlapTitle ? (
                          <div className="space-y-1 text-xs text-amber-700">
                            <Badge variant="warning">需复核</Badge>
                            <div>与已有称谓 {candidate.overlapTitle} 重叠</div>
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

interface GenericTitleDialogProps {
  open        : boolean;
  editing     : GenericTitleItem | null;
  onOpenChange: (open: boolean) => void;
  onSaved     : () => Promise<void>;
}

function GenericTitleDialog({
  open,
  editing,
  onOpenChange,
  onSaved
}: GenericTitleDialogProps) {
  const [title, setTitle] = useState("");
  const [tier, setTier] = useState<"SAFETY" | "DEFAULT">("DEFAULT");
  const [exemptInGenres, setExemptInGenres] = useState("");
  const [description, setDescription] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    setTitle(editing?.title ?? "");
    setTier(editing?.tier ?? "DEFAULT");
    setExemptInGenres(editing?.exemptInGenres?.join(",") ?? "");
    setDescription(editing?.description ?? "");
    setIsActive(editing?.isActive ?? true);
  }, [editing, open]);

  async function handleSubmit() {
    const genres = exemptInGenres
      .split(/[,，\s]+/)
      .map((item) => item.trim())
      .filter(Boolean);

    setSaving(true);
    try {
      if (editing) {
        await updateGenericTitle(editing.id, {
          tier,
          exemptInGenres: genres.length > 0 ? genres : null,
          description   : description || undefined,
          isActive
        });
      } else {
        await createGenericTitle({
          title,
          tier,
          exemptInGenres: genres.length > 0 ? genres : undefined,
          description   : description || undefined
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
          <DialogTitle>{editing ? "编辑泛化称谓" : "新增泛化称谓"}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>称谓</Label>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} disabled={!!editing} />
          </div>
          <div className="grid gap-2">
            <Label>层级</Label>
            <Select value={tier} onValueChange={(value) => setTier(value as "SAFETY" | "DEFAULT")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GENERIC_TITLE_TIER_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="text-xs text-muted-foreground">内部仍使用 SAFETY/DEFAULT 枚举，但前端统一显示中文说明。</div>
          </div>
          <div className="grid gap-2">
            <Label>书籍类型豁免</Label>
            <Input value={exemptInGenres} onChange={(event) => setExemptInGenres(event.target.value)} placeholder="用逗号分隔，例如：武侠,历史演义" />
          </div>
          <div className="grid gap-2">
            <Label>说明</Label>
            <Textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value)} />
          </div>
          <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground">
            当前层级说明：{getGenericTitleTierDescription(tier)}。
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
          <Button onClick={() => void handleSubmit()} disabled={saving || !title.trim()}>
            {saving ? "保存中..." : "保存"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
