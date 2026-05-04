"use client";

import { use, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import {
  PageContainer,
  PageHeader,
  PageSection
} from "@/components/layout/page-header";
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
import {
  fetchGenerationBooks,
  fetchKnowledgePack,
  importEntries as importKnowledgeEntries,
  pollAliasPackGenerationJob,
  previewGenerateEntriesPrompt,
  reviewGenerateEntries,
  type AliasPackGeneratedCandidate,
  type AliasPackGenerationJobStatus,
  type AliasPackGenerationPreview,
  type AliasPackGenerationReviewResult,
  type KnowledgeGenerationBookOption,
  type KnowledgePackItem
} from "@/lib/services/knowledge";

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

export default function GenerateEntriesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { toast } = useToast();

  const [pack, setPack]               = useState<KnowledgePackItem | null>(null);
  const [packLoading, setPackLoading] = useState(true);

  const [targetCount, setTargetCount]                       = useState("50");
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [bookOptions, setBookOptions]                       = useState<KnowledgeGenerationBookOption[]>([]);
  const [selectedBookId, setSelectedBookId]                 = useState("none");
  const [selectedModelId, setSelectedModelId]               = useState("");
  const [booksLoading, setBooksLoading]                     = useState(false);
  const [preview, setPreview]                               = useState<AliasPackGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]                 = useState(false);
  const [generating, setGenerating]                         = useState(false);
  const [progressStep, setProgressStep]                     = useState("");
  const [elapsedSeconds, setElapsedSeconds]                 = useState(0);
  const pollingRef                                          = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                                        = useRef<number>(0);

  const [review, setReview]                       = useState<AliasPackGenerationReviewResult | null>(null);
  const [selectedCandidates, setSelectedCandidates] = useState<Set<string>>(new Set());
  const [saving, setSaving]                       = useState(false);

  const {
    models : modelOptions,
    loading: modelsLoading,
    error  : modelsError,
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
    fetchKnowledgePack(id)
      .then(setPack)
      .catch((error) => toast({ title: "加载知识包失败", description: String(error), variant: "destructive" }))
      .finally(() => setPackLoading(false));
  }, [id, toast]);

  useEffect(() => {
    setBooksLoading(true);
    fetchGenerationBooks()
      .then(setBookOptions)
      .catch((error) => toast({ title: "加载书籍列表失败", description: String(error), variant: "destructive" }))
      .finally(() => setBooksLoading(false));
    refreshModels();
  }, [refreshModels, toast]);

  useEffect(() => {
    if (!selectedModelId && defaultModel) {
      setSelectedModelId(defaultModel.id);
    }
  }, [defaultModel, selectedModelId]);

  useEffect(() => {
    if (!selectedModelId) return;
    const stillExists = modelOptions.some((model) => model.id === selectedModelId);
    if (!stillExists) setSelectedModelId("");
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
    if (!pack) return;
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
  }

  async function handleGenerate() {
    if (!pack) return;
    if (!selectedModelId) {
      toast({ title: "请先选择生成模型", variant: "destructive" });
      return;
    }
    try {
      setGenerating(true);
      setProgressStep("正在提交生成任务…");
      setElapsedSeconds(0);
      const { jobId } = await reviewGenerateEntries(pack.id, {
        targetCount           : Number(targetCount) || 50,
        modelId               : selectedModelId,
        bookId                : selectedBookId !== "none" ? selectedBookId : undefined,
        additionalInstructions: additionalInstructions || undefined
      });
      setProgressStep("任务已提交，等待模型响应…");
      pollingRef.current = setInterval(() => {
        void (async () => {
          try {
            const status: AliasPackGenerationJobStatus = await pollAliasPackGenerationJob(pack.id, jobId);
            if (status.step) setProgressStep(status.step);
            if (status.status === "done") {
              stopPolling();
              setGenerating(false);
              if (status.result && "candidates" in status.result) {
                toast({
                  title      : "预审完成",
                  description: `共生成 ${status.result.candidates.length} 条候选，跳过 ${status.result.skipped} 条，已过滤已有 ${status.result.skippedExisting} 条。`
                });
                setReview(status.result);
                setSelectedCandidates(new Set(
                  status.result.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.canonicalName)
                ));
              }
            } else if (status.status === "error") {
              stopPolling();
              setGenerating(false);
              toast({ title: "生成失败", description: status.error ?? "未知错误", variant: "destructive" });
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

  function toggleCandidate(canonicalName: string) {
    setSelectedCandidates((previous) => {
      const next = new Set(previous);
      if (next.has(canonicalName)) next.delete(canonicalName);
      else next.add(canonicalName);
      return next;
    });
  }

  const selectedCandidateList = useMemo(() => {
    if (!review) return [] as AliasPackGeneratedCandidate[];
    return review.candidates.filter((candidate) => selectedCandidates.has(candidate.canonicalName));
  }, [review, selectedCandidates]);

  async function handleSave() {
    if (!pack || !review) return;
    setSaving(true);
    try {
      const result = await importKnowledgeEntries(pack.id, {
        entries: selectedCandidateList.map((candidate) => ({
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
        sourceDetail: `model=${review.model.provider}/${review.model.modelName}`,
        auditAction : "GENERATE"
      });
      toast({ title: "生成结果已保存", description: `写入 ${result.count} 条待审核候选。` });
      router.push(`/admin/knowledge-base/alias-packs?packId=${pack.id}`);
      router.refresh();
    } catch (error) {
      toast({ title: "保存失败", description: String(error), variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  const selectedModelName = modelOptions.find((m) => m.id === selectedModelId)?.name;
  const selectedBookTitle = bookOptions.find((b) => b.id === selectedBookId)?.title;
  const backHref          = `/admin/knowledge-base/alias-packs${pack ? `?packId=${pack.id}` : ""}`;

  return (
    <PageContainer>
      <PageHeader
        title={review ? "审核生成结果" : "模型生成候选条目"}
        description={review ? "选择需要保存的候选条目，确认后写入知识包。" : "调用大模型生成候选人物条目，预审通过后再写入知识包。"}
        breadcrumbs={[
          { label: "管理后台",   href: "/admin" },
          { label: "知识库",     href: "/admin/knowledge-base" },
          { label: "别名知识包", href: "/admin/knowledge-base/alias-packs" },
          { label: pack?.name ?? "知识包", href: backHref },
          { label: review ? "审核候选" : "模型生成" }
        ]}
      />

      {packLoading ? (
        <PageSection>
          <div className="py-12 text-center text-muted-foreground">加载中...</div>
        </PageSection>
      ) : !pack ? (
        <PageSection>
          <div className="py-12 text-center text-muted-foreground">知识包不存在或已被删除。</div>
        </PageSection>
      ) : !review ? (
        <PageSection>
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
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label>目标条数</Label>
                  <Input type="number" min={1} max={500} value={targetCount} disabled={generating} onChange={(event) => setTargetCount(event.target.value)} />
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

            {modelsError ? <p className="text-xs text-destructive">模型列表加载失败：{modelsError}</p> : null}
            {!modelsLoading && !modelsError && modelOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">当前暂无可用模型。请前往&quot;模型管理&quot;页面，至少启用并配置 1 个模型后再生成。</p>
            ) : null}

            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span>知识包：<span className="font-medium text-foreground">{pack.name}</span></span>
              <span className="text-border">·</span>
              <span>模型：<span className="font-medium text-foreground">{selectedModelName ?? "未选择"}</span></span>
              <span className="text-border">·</span>
              <span>参考书籍：<span className="font-medium text-foreground">{selectedBookTitle ?? "泛化生成"}</span></span>
              <span className="text-border">·</span>
              <span>目标 {targetCount} 条</span>
            </div>

            <p className="text-xs text-muted-foreground">参考书籍只参与本次提示词构造，不会把知识包绑定到书籍。补充要求临时写入提示词，适合一次性约束。</p>

            <div className="space-y-1.5">
              <Label>补充要求（可选）</Label>
              <Textarea rows={3} value={additionalInstructions} disabled={generating} onChange={(event) => setAdditionalInstructions(event.target.value)} placeholder="例如：重点补齐字号、法号与官衔代称；忽略只出现一次且歧义较大的称谓。" />
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
                <Button type="button" variant="outline" onClick={() => router.push(backHref)}>返回</Button>
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
        </PageSection>
      ) : (
        <PageSection>
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
                  review.candidates.filter((candidate) => candidate.defaultSelected).map((candidate) => candidate.canonicalName)
                ))}
              >
                恢复推荐
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSelectedCandidates(new Set(review.candidates.map((candidate) => candidate.canonicalName)))}
              >
                全选
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={() => setSelectedCandidates(new Set())}>
                清空
              </Button>
            </div>

            <div className="max-h-[60vh] overflow-auto rounded-md border">
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
                          checked={selectedCandidates.has(candidate.canonicalName)}
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

            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => { setReview(null); setSelectedCandidates(new Set()); }}>
                返回重新生成
              </Button>
              <Button type="button" onClick={() => void handleSave()} disabled={saving || selectedCandidateList.length === 0}>
                {saving ? "保存中..." : `确认保存选中条目（${selectedCandidateList.length}）`}
              </Button>
            </div>
          </div>
        </PageSection>
      )}
    </PageContainer>
  );
}
