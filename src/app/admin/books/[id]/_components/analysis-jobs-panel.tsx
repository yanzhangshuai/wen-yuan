"use client";

/**
 * ============================================================================
 * 文件定位：`src/app/admin/books/[id]/_components/analysis-jobs-panel.tsx`
 * ----------------------------------------------------------------------------
 * 这是书籍详情页“解析任务历史”面板（客户端组件）。
 *
 * 核心职责：
 * - 拉取并展示解析任务列表（状态、范围、模型、耗时）；
 * - 支持展开单条任务查看成本与阶段明细；
 * - 对任务成本做“粗略人民币估算”（仅命中内置价目表的模型）。
 *
 * React/业务设计要点：
 * - 列表在组件挂载后请求一次；
 * - 单行详情按需加载（首次展开才拉成本），减少初始开销；
 * - 折叠再展开复用缓存，避免重复请求造成抖动。
 * ============================================================================
 */

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

/**
 * 面板入参。
 */
interface AnalysisJobsPanelProps {
  /** 书籍 ID，用于查询该书所有解析任务。 */
  bookId: string;
}

/**
 * 任务状态到展示文案/颜色的映射。
 * 属于管理端运营语义映射，不建议在各组件散落重复定义。
 */
const JOB_STATUS_META: Record<string, { label: string; variant: "secondary" | "warning" | "success" | "destructive" | "default" }> = {
  SUCCEEDED: { label: "成功",   variant: "success"     },
  FAILED   : { label: "失败",   variant: "destructive" },
  RUNNING  : { label: "运行中", variant: "warning"     },
  QUEUED   : { label: "排队中", variant: "secondary"   },
  CANCELED : { label: "已取消", variant: "default"     }
};

/**
 * 将任务范围字段转换为可读文案。
 *
 * @param job 单条任务
 * @returns 范围描述字符串
 */
function formatScope(job: AnalysisJobListItem): string {
  if (job.scope === "FULL_BOOK") return "全书";
  if (job.scope === "CHAPTER_RANGE") {
    return `第 ${job.chapterStart ?? "?"} – ${job.chapterEnd ?? "?"} 章`;
  }
  if (job.scope === "CHAPTER_LIST" && job.chapterIndices.length > 0) {
    return `第 ${job.chapterIndices.join(", ")} 章`;
  }
  // 兜底显示原始 scope，便于排查后端新增值未同步的情况。
  return job.scope;
}

/**
 * 将解析架构转换为可读文案。
 */
function formatArchitecture(architecture: AnalysisJobListItem["architecture"]): string {
  return architecture === "threestage" ? "三阶段" : "顺序式";
}

/**
 * 格式化任务耗时。
 *
 * @param startedAt 开始时间
 * @param finishedAt 结束时间
 * @returns 可读耗时；缺失任一时间返回“—”
 */
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

/**
 * 日期时间格式化。
 */
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

/**
 * 任务状态徽标。
 */
function JobStatusBadge({ status }: { status: string }) {
  const meta = JOB_STATUS_META[status] ?? { label: status, variant: "default" as const };
  return <Badge variant={meta.variant}>{meta.label}</Badge>;
}

/**
 * 模型单价表（按百万 token 人民币估算）。
 *
 * 注意：
 * - 这是“展示层估算规则”，不是账单结算规则；
 * - 若模型不在表内会被跳过，目的是“宁可少估，不做误导性精确”。
 */
const MODEL_PRICING_CNY_PER_1M: Record<string, { prompt: number; completion: number }> = {
  "deepseek v3"  : { prompt: 2,   completion: 8   },
  "deepseek chat": { prompt: 2,   completion: 8   },
  "gemini flash" : { prompt: 0.7, completion: 2.1 },
  "glm 4.6"      : { prompt: 1.2, completion: 2.8 },
  "glm-4.6"      : { prompt: 1.2, completion: 2.8 },
  "通义千问 max"     : { prompt: 4,   completion: 12  },
  "通义千问 plus"    : { prompt: 1,   completion: 3   },
  "qwen max"     : { prompt: 4,   completion: 12  },
  "qwen plus"    : { prompt: 1,   completion: 3   }
};

/**
 * 根据模型名匹配价目表。
 *
 * @param modelName 实际任务记录中的模型名
 * @returns 命中价格则返回单价，否则返回 null
 */
function inferPricing(modelName: string): { prompt: number; completion: number } | null {
  const normalized = modelName.toLowerCase();
  const entry = Object.entries(MODEL_PRICING_CNY_PER_1M).find(([key]) => normalized.includes(key));
  return entry?.[1] ?? null;
}

/**
 * 根据成本汇总估算人民币费用。
 *
 * @param summary 成本汇总
 * @returns 估算金额；若无任何可匹配模型则返回 null
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

/**
 * 单条任务行（含可展开详情）。
 */
function JobRow({ job }: { job: AnalysisJobListItem }) {
  /** 当前行是否展开详情。 */
  const [expanded, setExpanded] = useState(false);
  /** 任务成本汇总缓存。 */
  const [summary, setSummary] = useState<JobCostSummary | null>(null);
  /** 成本汇总加载错误。 */
  const [summaryError, setSummaryError] = useState<string | null>(null);
  /** 成本汇总加载中。 */
  const [summaryLoading, setSummaryLoading] = useState(false);

  /**
   * 点击行切换展开状态。
   * 只在“第一次展开且没有缓存”时启动成本请求，避免重复开销。
   */
  function handleToggleExpand() {
    setExpanded((previous) => {
      const nextExpanded = !previous;
      if (nextExpanded && !summary && !summaryLoading) {
        setSummaryLoading(true);
        setSummaryError(null);
      }
      return nextExpanded;
    });
  }

  /**
   * 当需要加载且已展开时请求成本汇总。
   * 使用 cancelled 防止快速折叠/卸载后回写状态。
   */
  useEffect(() => {
    if (!expanded || summary || !summaryLoading) {
      return;
    }

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
        <td className="px-4 py-3 text-sm text-muted-foreground">{formatArchitecture(job.architecture)}</td>
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
          <td colSpan={7} className="px-4 py-3 text-sm space-y-2">
            {/* 一级摘要：便于快速读时序与重试情况 */}
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-muted-foreground">
              <span>解析架构</span>
              <span>{formatArchitecture(job.architecture)}</span>
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
                {/* 二级摘要卡：把常用指标放在一屏内 */}
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

                {/* 阶段明细：用于排查“哪个阶段最慢/最贵/fallback 最多” */}
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

            {/* 错误日志保留原文，便于复制排查。 */}
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

/**
 * 解析任务历史面板。
 */
export function AnalysisJobsPanel({ bookId }: AnalysisJobsPanelProps) {
  /** 任务列表；null 表示首屏加载中。 */
  const [jobs, setJobs] = useState<AnalysisJobListItem[] | null>(null);
  /** 列表加载错误。 */
  const [error, setError] = useState<string | null>(null);

  /**
   * bookId 变化时重新拉取任务列表。
   * 使用 cancelled 防止慢请求把旧书籍数据回写到新页面。
   */
  useEffect(() => {
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
                  <th className="px-4 py-2 text-left">架构</th>
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
