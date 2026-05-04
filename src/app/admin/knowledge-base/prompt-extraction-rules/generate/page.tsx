"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { PageContainer, PageHeader, PageSection } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAdminModels } from "@/hooks/use-admin-models";
import { useToast } from "@/hooks/use-toast";
import { fetchBookTypes, type BookTypeItem } from "@/lib/services/book-types";
import {
  generatePromptExtractionRules,
  pollPromptRuleGenerationJob,
  previewPromptExtractionGenerationPrompt,
  type PromptExtractionGenerationPreview,
  type PromptRuleType
} from "@/lib/services/prompt-extraction-rules";

const GLOBAL_BOOK_TYPE_VALUE = "__GLOBAL_BOOK_TYPE__";

const RULE_TYPE_OPTIONS: Array<{ value: PromptRuleType; label: string }> = [
  { value: "ENTITY",       label: "实体规则" },
  { value: "RELATIONSHIP", label: "关系规则" }
];

function getRuleTypeLabel(ruleType: PromptRuleType) {
  return RULE_TYPE_OPTIONS.find((option) => option.value === ruleType)?.label ?? ruleType;
}

function parsePromptRuleType(value: string): PromptRuleType {
  return RULE_TYPE_OPTIONS.find((option) => option.value === value)?.value ?? "ENTITY";
}

function formatGenerationModelOption(model: { name: string; provider: string; isDefault: boolean }): string {
  return `${model.name} · ${model.provider}${model.isDefault ? " · 默认" : ""}`;
}

export default function GeneratePromptExtractionRulesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [bookTypes, setBookTypes]                           = useState<BookTypeItem[]>([]);
  const [localRuleType, setLocalRuleType]                   = useState<PromptRuleType>("ENTITY");
  const [targetCount, setTargetCount]                       = useState("10");
  const [selectedModelId, setSelectedModelId]               = useState("");
  const [bookTypeId, setBookTypeId]                         = useState(GLOBAL_BOOK_TYPE_VALUE);
  const [additionalInstructions, setAdditionalInstructions] = useState("");
  const [preview, setPreview]                               = useState<PromptExtractionGenerationPreview | null>(null);
  const [previewLoading, setPreviewLoading]                 = useState(false);
  const [generating, setGenerating]                         = useState(false);
  const [progressStep, setProgressStep]                     = useState("");
  const [elapsedSeconds, setElapsedSeconds]                 = useState(0);
  const pollingRef                                          = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                                        = useRef<number>(0);

  const {
    models: modelOptions,
    loading: modelsLoading,
    error: modelsError,
    defaultModel
  } = useAdminModels({ onlyEnabled: true });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchBookTypes({ active: true });
        if (!cancelled) setBookTypes(list);
      } catch (error) {
        toast({ title: "加载书籍类型失败", description: String(error), variant: "destructive" });
      }
    })();
    return () => { cancelled = true; };
  }, [toast]);

  useEffect(() => {
    if (defaultModel && !selectedModelId) setSelectedModelId(defaultModel.id);
  }, [defaultModel, selectedModelId]);

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => () => stopPolling(), [stopPolling]);

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
              router.push("/admin/knowledge-base/prompt-extraction-rules");
              router.refresh();
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
    <PageContainer>
      <PageHeader
        title="模型生成 Prompt 提取规则"
        description="生成结果会直接写入数据库，来源为 LLM_SUGGESTED，默认停用；完成后请在列表中复核并手动启用。"
        breadcrumbs={[
          { label: "管理后台",         href: "/admin" },
          { label: "知识库",           href: "/admin/knowledge-base" },
          { label: "Prompt 提取规则", href: "/admin/knowledge-base/prompt-extraction-rules" },
          { label: "模型生成" }
        ]}
      >
        <Button type="button" variant="outline" onClick={() => router.push("/admin/knowledge-base/prompt-extraction-rules")} disabled={generating}>返回</Button>
      </PageHeader>

      <PageSection>
        <div className="grid max-w-3xl gap-4">
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
                <p className="mt-1 text-xs text-muted-foreground">已用时 {elapsedSeconds} 秒，模型推理可能需要 1~3 分钟，请勿关闭此页面</p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" variant="outline" onClick={() => void handlePreview()} disabled={previewLoading}>
                {previewLoading ? "预览中…" : "预览提示词"}
              </Button>
              <Button type="button" onClick={() => void handleGenerate()} disabled={!selectedModelId}>
                开始生成
              </Button>
            </div>
          )}

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
    </PageContainer>
  );
}
