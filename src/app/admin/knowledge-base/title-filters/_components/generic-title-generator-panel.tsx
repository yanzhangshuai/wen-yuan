"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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
import { useAdminModels } from "@/hooks/use-admin-models";
import { useToast } from "@/hooks/use-toast";
import { getGenericTitleTierLabel } from "@/lib/knowledge-presentation";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  createGenericTitle,
  pollTitleFilterGenerationJob,
  previewGenericTitleGenerationPrompt,
  reviewGeneratedGenericTitles,
  type GeneratedGenericTitleCandidate,
  type GenericTitleGenerationPreview,
  type GenericTitleGenerationReviewResult
} from "@/lib/services/title-filters";

const NO_REFERENCE_BOOK_TYPE = "all";

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

export function GenericTitleGeneratorPanel({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { toast } = useToast();

  const [bookTypes, setBookTypes] = useState<BookTypeItem[]>([]);
  const [targetCount, setTargetCount]                                 = useState("20");
  const [selectedModelId, setSelectedModelId]                         = useState("");
  const [selectedReferenceBookTypeId, setSelectedReferenceBookTypeId] = useState(NO_REFERENCE_BOOK_TYPE);
  const [additionalInstructions, setAdditionalInstructions]           = useState("");
  const [preview, setPreview]                                         = useState<GenericTitleGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]                           = useState(false);
  const [generating, setGenerating]                                   = useState(false);
  const [progressStep, setProgressStep]                               = useState("");
  const [elapsedSeconds, setElapsedSeconds]                           = useState(0);
  const pollingRef                                                     = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                                                   = useRef<number>(0);

  const [review, setReview]                         = useState<GenericTitleGenerationReviewResult | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [saving, setSaving]                         = useState(false);

  const normalizedTargetCount = useMemo(() => {
    const parsed = Number(targetCount);
    if (!Number.isFinite(parsed)) return 20;
    return Math.min(200, Math.max(1, Math.floor(parsed)));
  }, [targetCount]);

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

  useEffect(() => () => stopPolling(), [stopPolling]);

  useEffect(() => {
    fetchBookTypes({ active: true })
      .then(setBookTypes)
      .catch((error) => toast({ title: "加载书籍类型失败", description: String(error), variant: "destructive" }));
    refreshModels();
  }, [refreshModels, toast]);

  useEffect(() => {
    if (!selectedModelId && defaultModel) {
      setSelectedModelId(defaultModel.id);
    }
  }, [defaultModel, selectedModelId]);

  useEffect(() => {
    if (!selectedModelId) return;
    if (!modelOptions.some((m) => m.id === selectedModelId)) setSelectedModelId("");
  }, [modelOptions, selectedModelId]);

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
              toast({
                title      : "预审完成",
                description: `共生成 ${job.result.candidates.length} 条候选，跳过 ${job.result.skipped} 条，已过滤已有 ${job.result.skippedExisting} 条。`
              });
              setReview(job.result);
              setSelectedCandidates(new Set(
                job.result.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.title)
              ));
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

  function toggleCandidate(title: string) {
    setSelectedCandidates((previous) => {
      const next = new Set(previous);
      if (next.has(title)) next.delete(title);
      else next.add(title);
      return next;
    });
  }

  const selectedCandidateList = useMemo(() => {
    if (!review) return [] as GeneratedGenericTitleCandidate[];
    return review.candidates.filter((candidate) => selectedCandidates.has(candidate.title));
  }, [review, selectedCandidates]);

  async function handleSave() {
    setSaving(true);
    try {
      const settled = await Promise.allSettled(
        selectedCandidateList.map((candidate) => createGenericTitle({
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
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  const selectedModelName    = modelOptions.find((m) => m.id === selectedModelId)?.name;
  const selectedBookTypeName = bookTypes.find((bt) => bt.id === selectedReferenceBookTypeId)?.name;

  return (
    <>
      {!review ? (
        <div>
          <div className="space-y-4">
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
                  <SelectTrigger><SelectValue placeholder="不指定，通用场景" /></SelectTrigger>
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
            </div>

            {modelsError ? <p className="text-xs text-destructive">模型列表加载失败：{modelsError}</p> : null}
            {!modelsLoading && !modelsError && modelOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">当前暂无可用模型。请前往“模型管理”页面，至少启用并配置 1 个模型后再生成。</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>模型：<span className="font-medium text-foreground">{selectedModelName ?? "未选择"}</span></span>
              <span className="text-border">·</span>
              <span>题材：<span className="font-medium text-foreground">{selectedBookTypeName ?? "通用场景"}</span></span>
              <span className="text-border">·</span>
              <span>目标 {normalizedTargetCount} 条</span>
            </div>

            <p className="text-xs text-muted-foreground">参考题材只参与本次提示词构造，不会自动建立知识归属关系。补充要求临时写入提示词，适合一次性约束；如需长期生效应沉淀到提示词模板。</p>

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
                  <p className="mt-1 text-xs text-muted-foreground">已用时 {elapsedSeconds} 秒，模型推理可能需要 1~3 分钟，请勿离开此页面</p>
                </div>
              </div>
            ) : null}

            {!generating ? (
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={onClose}>返回</Button>
                <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>
                  {previewLoading ? "预览中…" : "预览提示词"}
                </Button>
                <Button type="button" onClick={() => void handleGenerate()} disabled={!selectedModelId}>开始预审</Button>
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
        </div>
      ) : (
        <div>
          <div className="grid gap-4">
            <div className="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
              模型：{review.model.provider} / {review.model.modelName} · 候选 {review.candidates.length} 条 · 已选中 {selectedCandidates.size} 条 · 跳过 {review.skipped} 条 · 已过滤已有 {review.skippedExisting} 条
            </div>

            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedCandidates(new Set(
                  review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.title)
                ))}
              >
                恢复推荐
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedCandidates(new Set(review.candidates.map((candidate) => candidate.title)))}
              >
                全选
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCandidates(new Set())}>清空</Button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-md border">
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
                          checked={selectedCandidates.has(candidate.title)}
                          onCheckedChange={() => toggleCandidate(candidate.title)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{candidate.title}</div>
                        {candidate.description ? <div className="mt-1 text-xs text-muted-foreground">{candidate.description}</div> : null}
                      </TableCell>
                      <TableCell>
                        <Badge variant={candidate.tier === "SAFETY" ? "destructive" : candidate.tier === "RELATIONAL" ? "outline" : "secondary"}>
                          {getGenericTitleTierLabel(candidate.tier)}
                        </Badge>
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

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => { setReview(null); setSelectedCandidates(new Set()); }}>返回重新生成</Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving || selectedCandidateList.length === 0}>
                {saving ? "保存中..." : `确认保存选中条目（${selectedCandidateList.length}）`}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
