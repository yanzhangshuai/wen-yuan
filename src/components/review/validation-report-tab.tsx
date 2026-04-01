"use client";

import { useState } from "react";
import {
  AlertCircle,
  AlertTriangle,
  Info,
  ChevronDown,
  ChevronUp,
  Check,
  Loader2,
  Wrench,
  FileSearch
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ValidationReportItem, ValidationReportDetail } from "@/lib/services/validation-reports";
import { fetchValidationReportDetail, applyAutoFixes } from "@/lib/services/validation-reports";
import type { ValidationIssue, ValidationSeverity } from "@/types/validation";

/* ------------------------------------------------
   Constants
   ------------------------------------------------ */

const SEVERITY_CONFIG: Record<ValidationSeverity, { icon: typeof AlertCircle; color: string; label: string }> = {
  ERROR  : { icon: AlertCircle, color: "text-destructive", label: "错误" },
  WARNING: { icon: AlertTriangle, color: "text-amber-500", label: "警告" },
  INFO   : { icon: Info, color: "text-blue-500", label: "信息" }
};

const ISSUE_TYPE_LABELS: Record<string, string> = {
  ALIAS_AS_NEW_PERSONA      : "别名误识为新人物",
  WRONG_MERGE               : "错误合并",
  MISSING_NAME_MAPPING      : "缺少真名映射",
  INVALID_RELATIONSHIP      : "不合理关系",
  SAME_NAME_DIFFERENT_PERSON: "同名不同人",
  DUPLICATE_PERSONA         : "重复人物",
  LOW_CONFIDENCE_ENTITY     : "低置信度实体",
  ORPHAN_MENTION            : "孤立提及"
};

const ACTION_LABELS: Record<string, string> = {
  MERGE        : "合并人物",
  SPLIT        : "拆分人物",
  UPDATE_NAME  : "更新名称",
  ADD_ALIAS    : "添加别名",
  DELETE       : "删除",
  ADD_MAPPING  : "添加映射",
  MANUAL_REVIEW: "人工审核"
};

/* ------------------------------------------------
   Props
   ------------------------------------------------ */

export interface ValidationReportTabProps {
  bookId   : string;
  reports  : ValidationReportItem[];
  onRefresh: () => void;
}

/* ------------------------------------------------
   Component
   ------------------------------------------------ */

export function ValidationReportTab({ bookId, reports, onRefresh }: ValidationReportTabProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ValidationReportDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [applyLoading, setApplyLoading] = useState<string | null>(null);

  async function handleToggleExpand(reportId: string) {
    if (expandedId === reportId) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(reportId);
    setDetailLoading(true);
    try {
      const d = await fetchValidationReportDetail(bookId, reportId);
      setDetail(d);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }

  async function handleApplyFixes(reportId: string) {
    setApplyLoading(reportId);
    try {
      const result = await applyAutoFixes(bookId, reportId);
      // After applying, re-expand to show updated detail + refresh parent
      const d = await fetchValidationReportDetail(bookId, reportId);
      setDetail(d);
      onRefresh();
      // Optionally show success via alert (keeping it simple)
      if (result.appliedCount > 0) {
        // silent success, the UI will update
      }
    } catch {
      // silent
    } finally {
      setApplyLoading(null);
    }
  }

  if (reports.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <div className="mb-3 rounded-full bg-muted p-3">
          <Check size={20} className="text-success" />
        </div>
        <p className="text-sm text-muted-foreground">暂无自检报告</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {reports.map(report => {
        const isExpanded = expandedId === report.id;
        const s = report.summary;
        const scopeLabel = report.scope === "CHAPTER" ? "章节级" : "全书级";
        const statusLabel = report.status === "APPLIED" ? "已应用" : report.status === "REVIEWED" ? "已审核" : "待处理";
        const statusVariant = report.status === "APPLIED" ? "default" as const : report.status === "REVIEWED" ? "secondary" as const : "outline" as const;

        return (
          <div key={report.id} className="rounded-lg border border-border bg-card shadow-sm">
            {/* Report header — clickable to expand */}
            <button
              type="button"
              onClick={() => { void handleToggleExpand(report.id); }}
              className="flex w-full items-center justify-between p-3 text-left"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <FileSearch size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{scopeLabel}自检报告</span>
                  <Badge variant={statusVariant} className="text-[10px]">{statusLabel}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                  <span>共 {s.totalIssues} 个问题</span>
                  {s.errorCount > 0 && <span className="text-destructive">🔴 {s.errorCount} 错误</span>}
                  {s.warningCount > 0 && <span className="text-amber-500">⚠️ {s.warningCount} 警告</span>}
                  {s.infoCount > 0 && <span className="text-blue-500">ℹ️ {s.infoCount} 信息</span>}
                  <span>可自动修正 {s.autoFixable} 项</span>
                  <span className="ml-auto text-muted-foreground/70">
                    {new Date(report.createdAt).toLocaleString("zh-CN")}
                  </span>
                </div>
              </div>
              {isExpanded
                ? <ChevronUp size={16} className="text-muted-foreground shrink-0" />
                : <ChevronDown size={16} className="text-muted-foreground shrink-0" />}
            </button>

            {/* Expanded detail */}
            {isExpanded && (
              <div className="border-t border-border px-3 pb-3">
                {detailLoading && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={18} className="animate-spin text-muted-foreground" />
                  </div>
                )}

                {!detailLoading && detail && (
                  <>
                    {/* Auto-fix button */}
                    {report.status !== "APPLIED" && s.autoFixable > 0 && (
                      <div className="mt-3 mb-2">
                        <Button
                          size="sm"
                          onClick={() => { void handleApplyFixes(report.id); }}
                          disabled={applyLoading === report.id}
                        >
                          {applyLoading === report.id
                            ? <Loader2 size={14} className="animate-spin" />
                            : <Wrench size={14} />}
                          <span className="ml-1">应用自动修正（{s.autoFixable} 项）</span>
                        </Button>
                      </div>
                    )}

                    {/* Issue list */}
                    <div className="mt-2 flex flex-col gap-2">
                      {detail.issues.map(issue => (
                        <IssueCard key={issue.id} issue={issue} />
                      ))}
                    </div>
                  </>
                )}

                {!detailLoading && !detail && (
                  <p className="py-4 text-center text-sm text-muted-foreground">加载报告详情失败</p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------
   Issue Card sub-component
   ------------------------------------------------ */

function IssueCard({ issue }: { issue: ValidationIssue }) {
  const sev = SEVERITY_CONFIG[issue.severity] ?? SEVERITY_CONFIG.INFO;
  const SevIcon = sev.icon;
  const typeLabel = ISSUE_TYPE_LABELS[issue.type] ?? issue.type;
  const actionLabel = ACTION_LABELS[issue.suggestion.action] ?? issue.suggestion.action;

  return (
    <div className="rounded-md border border-border/60 bg-muted/30 p-2.5">
      <div className="flex items-start gap-2">
        <SevIcon size={14} className={`mt-0.5 shrink-0 ${sev.color}`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <Badge variant="secondary" className="text-[10px]">{typeLabel}</Badge>
            <span className="text-[10px] text-muted-foreground">
              置信度 {Math.round(issue.confidence * 100)}%
            </span>
          </div>
          <p className="mt-1 text-xs text-foreground">{issue.description}</p>
          {issue.evidence && (
            <p className="mt-1 text-[10px] text-muted-foreground line-clamp-2">
              证据：{issue.evidence}
            </p>
          )}
          {/* Suggestion */}
          <div className="mt-1.5 flex items-center gap-1.5 rounded bg-muted/60 px-2 py-1">
            <Wrench size={10} className="text-muted-foreground shrink-0" />
            <span className="text-[10px] text-muted-foreground">
              建议：<span className="font-medium text-foreground">{actionLabel}</span>
              {issue.suggestion.reason && ` — ${issue.suggestion.reason}`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
