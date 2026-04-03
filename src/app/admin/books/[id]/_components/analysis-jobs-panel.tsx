"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { fetchBookJobs, type AnalysisJobListItem } from "@/lib/services/books";
import { fetchJobCostSummary, type JobCostSummary } from "@/lib/services/model-strategy";

interface AnalysisJobsPanelProps {
  bookId: string;
}

const JOB_STATUS_META: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "destructive" | "default" }> = {
  SUCCEEDED: { label: "成功", variant: "success" },
  FAILED   : { label: "失败", variant: "destructive" },
  RUNNING  : { label: "运行中", variant: "warning" },
  QUEUED   : { label: "排队中", variant: "secondary" },
  CANCELED : { label: "已取消", variant: "default" }
};

function formatScope(job: AnalysisJobListItem): string {
  if (job.scope === "FULL_BOOK") return "全书";
  if (job.scope === "CHAPTER_RANGE") {
    return `第 ${job.chapterStart ?? "?"} – ${job.chapterEnd ?? "?"} 章`;
  }
  if (job.scope === "CHAPTER_LIST" && job.chapterIndices.length > 0) {
    return `第 ${job.chapterIndices.join(", ")} 章`;
  }
  return job.scope;
}

function formatDuration(startedAt: string | null, finishedAt: string | null): string {
  if (!startedAt || !finishedAt) return "—";
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("zh-CN", {
    month : "2-digit",
    day   : "2-digit",
    hour  : "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function JobStatusBadge({ status }: { status: string }) {
  const meta = JOB_STATUS_META[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

const MODEL_PRICING_CNY_PER_1M: Record<string, { prompt: number; completion: number }> = {
  "deepseek v3"  : { prompt: 2, completion: 8 },
  "deepseek chat": { prompt: 2, completion: 8 },
  "gemini flash" : { prompt: 0.7, completion: 2.1 },
  "通义千问 max"     : { prompt: 4, completion: 12 },
  "通义千问 plus"    : { prompt: 1, completion: 3 },
  "qwen max"     : { prompt: 4, completion: 12 },
  "qwen plus"    : { prompt: 1, completion: 3 }
};

function inferPricing(modelName: string): { prompt: number; completion: number } | null {
  const normalized = modelName.toLowerCase();
  const entry = Object.entries(MODEL_PRICING_CNY_PER_1M).find(([key]) => normalized.includes(key));
  return entry?.[1] ?? null;
}

/**
 * 按阶段-模型聚合后的 token 进行粗略人民币估算。
 * 仅对内置价目表能命中的模型计费，未知模型直接跳过，避免误报高精度成本。
 */
function estimateCostCny(summary: JobCostSummary): number | null {
  let hasKnownPricing = false;
  let totalCost = 0;

  for (const stage of summary.byStage) {
    for (const model of stage.models) {
      const pricing = inferPricing(model.modelName);
      if (!pricing) {
        continue;
      }

      hasKnownPricing = true;
      totalCost += (model.promptTokens / 1_000_000) * pricing.prompt;
      totalCost += (model.completionTokens / 1_000_000) * pricing.completion;
    }
  }

  return hasKnownPricing ? totalCost : null;
}

function JobRow({ job }: { job: AnalysisJobListItem }) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState<JobCostSummary | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);

  function handleToggleExpand() {
    setExpanded((previous) => {
      const nextExpanded = !previous;
      // 只在第一次展开时触发加载，后续折叠/展开复用缓存，避免列表频繁抖动请求。
      if (nextExpanded && !summary && !summaryLoading) {
        setSummaryLoading(true);
        setSummaryError(null);
      }
      return nextExpanded;
    });
  }

  useEffect(() => {
    if (!expanded || summary || !summaryLoading) {
      return;
    }

    // 组件卸载或行快速折叠时终止状态写入，避免 React 警告和脏状态覆盖。
    let cancelled = false;
    fetchJobCostSummary(job.id)
      .then((data) => {
        if (!cancelled) {
          setSummary(data);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          setSummaryError(error instanceof Error ? error.message : "成本信息加载失败");
        }
      })
      .finally(() => {
        if (!cancelled) {
          setSummaryLoading(false);
        }
      });

    return () => { cancelled = true; };
  }, [expanded, job.id, summary, summaryLoading]);

  const estimatedCost = summary ? estimateCostCny(summary) : null;

  return (
    <>
      <tr
        className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={handleToggleExpand}
      >
        <td className="px-4 py-3">
          <div className="flex items-center gap-1 text-muted-foreground">
            {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <span className="text-xs font-mono">{job.id.slice(0, 8)}</span>
          </div>
        </td>
        <td className="px-4 py-3">
          <JobStatusBadge status={job.status} />
        </td>
        <td className="px-4 py-3 text-sm">{formatScope(job)}</td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {job.aiModelName ?? "—"}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {formatDateTime(job.createdAt)}
        </td>
        <td className="px-4 py-3 text-sm text-muted-foreground">
          {formatDuration(job.startedAt, job.finishedAt)}
        </td>
      </tr>
      {expanded && (
        <tr className="border-t border-border bg-muted/10">
          <td colSpan={6} className="px-4 py-3 text-sm space-y-2">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-muted-foreground">
              <span>开始时间</span>
              <span>{job.startedAt ? formatDateTime(job.startedAt) : "—"}</span>
              <span>完成时间</span>
              <span>{job.finishedAt ? formatDateTime(job.finishedAt) : "—"}</span>
              <span>重试次数</span>
              <span>{job.attempt}</span>
            </div>

            {summaryLoading && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                加载成本统计...
              </div>
            )}

            {summaryError && (
              <p className="text-xs text-destructive">{summaryError}</p>
            )}

            {summary && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded border border-border p-2">
                    <p className="text-xs text-muted-foreground">Token 消耗</p>
                    <p className="font-medium">
                      {summary.totalPromptTokens} + {summary.totalCompletionTokens}
                    </p>
                  </div>
                  <div className="rounded border border-border p-2">
                    <p className="text-xs text-muted-foreground">调用统计</p>
                    <p className="font-medium">
                      {summary.totalCalls} 次（失败 {summary.failedCalls} 次）
                    </p>
                  </div>
                  <div className="rounded border border-border p-2">
                    <p className="text-xs text-muted-foreground">Fallback 次数</p>
                    <p className="font-medium">{summary.fallbackCalls}</p>
                  </div>
                  <div className="rounded border border-border p-2">
                    <p className="text-xs text-muted-foreground">成本估算</p>
                    <p className="font-medium">
                      {estimatedCost === null ? "暂无定价" : `约 ¥${estimatedCost.toFixed(4)}`}
                    </p>
                  </div>
                </div>

                <div className="rounded border border-border overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-muted/40 text-muted-foreground">
                      <tr>
                        <th className="px-2 py-2 text-left">阶段</th>
                        <th className="px-2 py-2 text-left">调用</th>
                        <th className="px-2 py-2 text-left">Token</th>
                        <th className="px-2 py-2 text-left">阶段模型明细</th>
                      </tr>
                    </thead>
                    <tbody>
                      {summary.byStage.map((stage) => (
                        <tr key={stage.stage} className="border-t border-border align-top">
                          <td className="px-2 py-2 font-medium">{stage.stage}</td>
                          <td className="px-2 py-2">
                            {stage.calls} 次
                            <br />
                            <span className="text-muted-foreground">
                              平均 {Math.round(stage.avgDurationMs)}ms
                            </span>
                          </td>
                          <td className="px-2 py-2">
                            {stage.promptTokens} + {stage.completionTokens}
                          </td>
                          <td className="px-2 py-2 space-y-1">
                            {stage.models.map((model) => (
                              <div key={`${stage.stage}-${model.modelId ?? "unknown"}-${model.isFallback ? "fallback" : "primary"}`} className="flex flex-wrap items-center gap-2">
                                <span>{model.modelName}</span>
                                {model.isFallback && (
                                  <Badge variant="warning" className="text-[10px]">fallback</Badge>
                                )}
                                <span className="text-muted-foreground">
                                  {model.calls} 次，{model.promptTokens}+{model.completionTokens}
                                </span>
                              </div>
                            ))}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {job.errorLog && (
              <div className="mt-2">
                <p className="text-xs text-muted-foreground mb-1 font-medium">错误日志</p>
                <pre className="text-xs text-destructive whitespace-pre-wrap bg-destructive/5 rounded p-2 border border-destructive/20">
                  {job.errorLog}
                </pre>
              </div>
            )}
          </td>
        </tr>
      )}
    </>
  );
}

export function AnalysisJobsPanel({ bookId }: AnalysisJobsPanelProps) {
  const [jobs, setJobs] = useState<AnalysisJobListItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // bookId 变化时重新拉取任务列表，并防止慢请求回写过期书籍的数据。
    let cancelled = false;
    fetchBookJobs(bookId)
      .then(data => { if (!cancelled) setJobs(data); })
      .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : "加载失败"); });
    return () => { cancelled = true; };
  }, [bookId]);

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!jobs) {
    return (
      <Card>
        <CardContent className="pt-6 flex items-center gap-2 text-muted-foreground text-sm">
          <Loader2 size={16} className="animate-spin" />
          加载解析任务...
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">解析任务历史</CardTitle>
        <CardDescription>共 {jobs.length} 条记录，按创建时间降序排列。点击行可展开详情。</CardDescription>
      </CardHeader>
      <CardContent>
        {jobs.length === 0 ? (
          <p className="text-sm text-muted-foreground">暂无解析任务记录。</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="px-4 py-2 text-left w-28">任务 ID</th>
                  <th className="px-4 py-2 text-left w-24">状态</th>
                  <th className="px-4 py-2 text-left">范围</th>
                  <th className="px-4 py-2 text-left">模型</th>
                  <th className="px-4 py-2 text-left">创建时间</th>
                  <th className="px-4 py-2 text-left">耗时</th>
                </tr>
              </thead>
              <tbody>
                {jobs.map(job => (
                  <JobRow key={job.id} job={job} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
