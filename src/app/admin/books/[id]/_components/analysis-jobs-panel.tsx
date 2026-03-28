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

function JobRow({ job }: { job: AnalysisJobListItem }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className="border-t border-border hover:bg-muted/30 transition-colors cursor-pointer"
        onClick={() => setExpanded(prev => !prev)}
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
